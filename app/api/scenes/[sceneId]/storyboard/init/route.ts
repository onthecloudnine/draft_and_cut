import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client } from "@/lib/s3/client";
import { buildStoryboardFrameS3Key } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { StoryboardFrame } from "@/models/StoryboardFrame";

const initStoryboardSchema = z.object({
  shotId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  fileSizeMb: z.number().positive(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = initStoryboardSchema.parse(await request.json());
    const maxUploadMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);

    if (body.fileSizeMb > maxUploadMb) {
      return jsonError(`File exceeds max upload size of ${maxUploadMb} MB`, 413);
    }

    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    await assertProjectPermission(user.id, String(scene.projectId), "video:upload");

    const [project, shot] = await Promise.all([
      Project.findById(scene.projectId).lean(),
      Shot.findById(body.shotId).lean()
    ]);

    if (!project) {
      return jsonError("Project not found", 404);
    }

    if (!shot) {
      return jsonError("Shot not found", 404);
    }

    if (String(shot.sceneId) !== sceneId) {
      return jsonError("Shot does not belong to scene", 400);
    }

    const latest = await StoryboardFrame.findOne({ shotId: body.shotId })
      .sort({ versionNumber: -1 })
      .lean();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const uploadId = randomUUID();
    const s3Key = buildStoryboardFrameS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      shotNumber: shot.shotNumber,
      versionNumber,
      fileName: body.fileName
    });

    const frame = await StoryboardFrame.create({
      projectId: scene.projectId,
      sceneId,
      shotId: body.shotId,
      versionNumber,
      fileName: body.fileName,
      s3Key,
      mimeType: body.mimeType,
      fileSizeMb: body.fileSizeMb,
      width: body.width,
      height: body.height,
      uploadedBy: user.id,
      uploadId,
      status: "uploading"
    });

    const { command, uploadHeaders } = buildPutObjectUpload({ key: s3Key, contentType: body.mimeType });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });

    return NextResponse.json({
      uploadId,
      storyboardFrameId: String(frame._id),
      versionNumber,
      uploadHeaders,
      uploadUrl
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid storyboard payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
