import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client } from "@/lib/s3/client";
import { buildArtReferenceS3Key } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { ArtReference } from "@/models/ArtReference";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";

const initSchema = z.object({
  shotId: z.string().min(1),
  galleryId: z.string().optional(),
  fileName: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  fileSizeMb: z.number().positive()
});

export async function POST(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = initSchema.parse(await request.json());
    const maxUploadMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);
    if (body.fileSizeMb > maxUploadMb) {
      return jsonError(`File exceeds max upload size of ${maxUploadMb} MB`, 413);
    }

    await connectDb();
    const scene = await Scene.findById(sceneId).lean();
    if (!scene) return jsonError("Scene not found", 404);
    const role = await assertProjectPermission(user.id, String(scene.projectId), "video:upload");
    if (role !== "admin") return jsonError("Forbidden", 403);

    const [project, shot] = await Promise.all([
      Project.findById(scene.projectId).lean(),
      Shot.findById(body.shotId).lean()
    ]);
    if (!project) return jsonError("Project not found", 404);
    if (!shot) return jsonError("Shot not found", 404);
    if (String(shot.sceneId) !== sceneId) return jsonError("Shot does not belong to scene", 400);

    // Galería existente (agregar imagen) o nueva (nueva versión).
    let gallery;
    if (body.galleryId) {
      gallery = await ArtReference.findById(body.galleryId);
      if (!gallery || String(gallery.shotId) !== body.shotId) {
        return jsonError("Gallery not found", 404);
      }
    } else {
      const latest = await ArtReference.findOne({ shotId: body.shotId }).sort({ versionNumber: -1 }).lean();
      gallery = await ArtReference.create({
        projectId: scene.projectId,
        sceneId,
        shotId: body.shotId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        title: "",
        images: [],
        createdBy: user.id
      });
    }

    const uploadId = randomUUID();
    const s3Key = buildArtReferenceS3Key({
      projectSlug: project.slug,
      sceneNumber: scene.sceneNumber,
      shotNumber: shot.shotNumber,
      versionNumber: gallery.versionNumber,
      uploadId,
      fileName: body.fileName
    });

    gallery.images.push({
      s3Key,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSizeMb: body.fileSizeMb,
      status: "uploading",
      order: gallery.images.length
    });
    await gallery.save();
    const image = gallery.images[gallery.images.length - 1];

    const { command, uploadHeaders } = buildPutObjectUpload({ key: s3Key, contentType: body.mimeType });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });

    return NextResponse.json({
      galleryId: String(gallery._id),
      versionNumber: gallery.versionNumber,
      imageId: String(image._id),
      uploadUrl,
      uploadHeaders
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
