import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { createZipArchive } from "@/lib/archive/zip";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { Scene } from "@/models/Scene";
import { SceneAttachment } from "@/models/SceneAttachment";
import { VideoVersion } from "@/models/VideoVersion";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function readS3Object(s3Key: string) {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getUploadBucket(),
      Key: s3Key
    })
  );

  if (!response.Body) {
    throw new Error(`S3 object ${s3Key} has no body`);
  }

  return response.Body.transformToByteArray();
}

export async function GET(_request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    await assertProjectPermission(user.id, String(scene.projectId), "project:read");

    const [attachments, currentVideo] = await Promise.all([
      SceneAttachment.find({ sceneId, status: "ready" }).sort({ attachmentDate: -1, createdAt: -1 }).lean(),
      VideoVersion.findOne({
        sceneId,
        scope: "scene",
        status: "ready_for_review",
        ...(scene.currentVideoVersionId ? { _id: scene.currentVideoVersionId } : {})
      })
        .sort({ isFavorite: -1, createdAt: -1 })
        .lean()
    ]);
    const fallbackVideo =
      currentVideo ??
      (await VideoVersion.findOne({ sceneId, scope: "scene", status: "ready_for_review" })
        .sort({ isFavorite: -1, createdAt: -1 })
        .lean());

    const entries = [];

    if (fallbackVideo) {
      entries.push({
        name: `video/${sanitizeFileName(fallbackVideo.fileName) || "video"}`,
        data: await readS3Object(fallbackVideo.s3Key),
        modifiedAt: fallbackVideo.createdAt
      });
    }

    for (const attachment of attachments) {
      entries.push({
        name: `assets/${sanitizeFileName(attachment.title) || "asset"}-${sanitizeFileName(attachment.fileName)}`,
        data: await readS3Object(attachment.s3Key),
        modifiedAt: attachment.attachmentDate
      });
    }

    if (entries.length === 0) {
      return jsonError("No assets or scene video are ready to download", 404);
    }

    const zip = createZipArchive(entries);
    const fileName = `escena-${sanitizeFileName(scene.sceneNumber)}-assets.zip`;

    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zip.length)
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
