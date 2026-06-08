import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client } from "@/lib/s3/client";
import { buildSceneAudioS3Key } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { AudioVersion } from "@/models/AudioVersion";
import { soundStems } from "@/types/domain";

const initAudioSchema = z.object({
  stem: z.enum(soundStems),
  fileName: z.string().min(1),
  mimeType: z.string().regex(/^audio\//, "mimeType must be an audio type"),
  fileSizeMb: z.number().positive(),
  duration: z.number().positive()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = initAudioSchema.parse(await request.json());
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

    const project = await Project.findById(scene.projectId).lean();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    const latest = await AudioVersion.findOne({ sceneId, stem: body.stem })
      .sort({ versionNumber: -1 })
      .lean();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const uploadId = randomUUID();
    const s3Key = buildSceneAudioS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      stem: body.stem,
      versionNumber,
      fileName: body.fileName
    });

    const audioVersion = await AudioVersion.create({
      projectId: scene.projectId,
      sceneId,
      scope: "scene",
      stem: body.stem,
      versionNumber,
      fileName: body.fileName,
      s3Key,
      mimeType: body.mimeType,
      duration: body.duration,
      fileSizeMb: body.fileSizeMb,
      uploadedBy: user.id,
      uploadId,
      status: "uploading"
    });

    const { command, uploadHeaders } = buildPutObjectUpload({ key: s3Key, contentType: body.mimeType });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });

    return NextResponse.json({
      uploadId,
      audioVersionId: String(audioVersion._id),
      versionNumber,
      uploadHeaders,
      uploadUrl
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid audio payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
