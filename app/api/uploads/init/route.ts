import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client } from "@/lib/s3/client";
import { buildVideoS3Key, buildVideoThumbnailS3Key } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { jsonError } from "@/lib/api/http";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { ScriptVersion } from "@/models/ScriptVersion";
import { VideoVersion } from "@/models/VideoVersion";
import { productionStages } from "@/types/domain";

const initUploadSchema = z
  .object({
    projectId: z.string().min(1),
    sceneId: z.string().min(1),
    scope: z.enum(["scene", "shot"]).optional().default("scene"),
    shotId: z.string().optional(),
    stage: z.enum(productionStages),
    fileName: z.string().min(1),
    mimeType: z.literal("video/mp4"),
    fileSizeMb: z.number().positive(),
    duration: z.number().positive(),
    fps: z.number().positive(),
    resolution: z.string().min(3),
    notes: z.string().optional().default("")
  })
  .refine((data) => data.scope !== "shot" || Boolean(data.shotId), {
    message: "shotId is required for shot scoped uploads",
    path: ["shotId"]
  });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = initUploadSchema.parse(await request.json());
    const maxUploadMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);

    if (body.fileSizeMb > maxUploadMb) {
      return jsonError(`File exceeds max upload size of ${maxUploadMb} MB`, 413);
    }

    await assertProjectPermission(user.id, body.projectId, "video:upload");
    await connectDb();

    const [project, scene, activeScriptVersion] = await Promise.all([
      Project.findById(body.projectId).lean(),
      Scene.findById(body.sceneId).lean(),
      ScriptVersion.findOne({ projectId: body.projectId, status: "active" }).lean()
    ]);

    if (!project || !scene) {
      return jsonError("Project or scene not found", 404);
    }

    if (String(scene.projectId) !== body.projectId) {
      return jsonError("Scene does not belong to project", 400);
    }

    let shotNumber: string | null = null;
    if (body.scope === "shot") {
      const shot = await Shot.findById(body.shotId).lean();
      if (!shot) {
        return jsonError("Shot not found", 404);
      }
      if (String(shot.sceneId) !== body.sceneId) {
        return jsonError("Shot does not belong to scene", 400);
      }
      shotNumber = shot.shotNumber;
    }

    const latest = await VideoVersion.findOne({
      projectId: body.projectId,
      sceneId: body.sceneId,
      shotId: body.scope === "shot" ? body.shotId : null,
      scope: body.scope,
      stage: body.stage
    })
      .sort({ versionNumber: -1 })
      .lean();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const uploadId = randomUUID();
    const s3Key = buildVideoS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      shotNumber,
      scope: body.scope,
      stage: body.stage,
      versionNumber
    });
    const thumbnailKey = buildVideoThumbnailS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      shotNumber,
      scope: body.scope,
      stage: body.stage,
      versionNumber
    });
    const frameCount = Math.round(body.duration * body.fps);

    const videoVersion = await VideoVersion.create({
      projectId: body.projectId,
      sceneId: body.sceneId,
      shotId: body.scope === "shot" ? body.shotId : null,
      scope: body.scope,
      versionNumber,
      stage: body.stage,
      status: "uploading",
      fileName: body.fileName,
      s3Key,
      mimeType: body.mimeType,
      duration: body.duration,
      fps: body.fps,
      frameCount,
      resolution: body.resolution,
      fileSizeMb: body.fileSizeMb,
      uploadedBy: user.id,
      notes: body.notes,
      scriptVersionId: activeScriptVersion?._id,
      uploadId,
      thumbnailKey
    });

    const { command, uploadHeaders } = buildPutObjectUpload({ key: s3Key, contentType: body.mimeType });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });
    const thumbnailUpload = buildPutObjectUpload({ key: thumbnailKey, contentType: "image/jpeg" });
    const thumbnailUploadUrl = await getSignedUrl(getS3Client(), thumbnailUpload.command, { expiresIn: 60 * 10 });

    return NextResponse.json({
      uploadId,
      videoVersionId: String(videoVersion._id),
      versionNumber,
      uploadType: "single",
      uploadHeaders,
      uploadUrl,
      thumbnailUploadUrl,
      thumbnailUploadHeaders: thumbnailUpload.uploadHeaders
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid upload payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
