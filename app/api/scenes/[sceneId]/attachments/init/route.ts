import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client } from "@/lib/s3/client";
import { buildSceneAttachmentS3Key } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { SceneAttachment } from "@/models/SceneAttachment";

const initAttachmentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  attachmentDate: z.string().datetime(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeMb: z.number().positive()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = initAttachmentSchema.parse(await request.json());
    const maxUploadMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);

    if (body.fileSizeMb > maxUploadMb) {
      return jsonError(`File exceeds max upload size of ${maxUploadMb} MB`, 413);
    }

    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    await assertProjectPermission(user.id, String(scene.projectId), "project:read");

    const project = await Project.findById(scene.projectId).lean();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    const uploadId = randomUUID();
    const s3Key = buildSceneAttachmentS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      uploadId,
      fileName: body.fileName
    });

    const attachment = await SceneAttachment.create({
      projectId: scene.projectId,
      sceneId,
      title: body.title,
      description: body.description,
      attachmentDate: new Date(body.attachmentDate),
      fileName: body.fileName,
      s3Key,
      mimeType: body.mimeType,
      fileSizeMb: body.fileSizeMb,
      uploadedBy: user.id,
      uploadId,
      status: "uploading"
    });

    const { command, uploadHeaders } = buildPutObjectUpload({ key: s3Key, contentType: body.mimeType });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });

    return NextResponse.json({
      uploadId,
      attachmentId: String(attachment._id),
      uploadHeaders,
      uploadUrl
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid attachment payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
