import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { ArtReference } from "@/models/ArtReference";
import { Scene } from "@/models/Scene";

const patchSchema = z.object({ title: z.string().max(200) });

async function loadGallery(sceneId: string, galleryId: string, userId: string) {
  await connectDb();
  const scene = await Scene.findById(sceneId).lean();
  if (!scene) return { gallery: null, error: jsonError("Scene not found", 404) };
  const role = await assertProjectPermission(userId, String(scene.projectId), "video:upload");
  if (role !== "admin") return { gallery: null, error: jsonError("Forbidden", 403) };
  const gallery = await ArtReference.findById(galleryId);
  if (!gallery || String(gallery.sceneId) !== sceneId)
    return { gallery: null, error: jsonError("Gallery not found", 404) };
  return { gallery, error: null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sceneId: string; galleryId: string }> }
) {
  try {
    const { sceneId, galleryId } = await params;
    const user = await requireUser();
    const body = patchSchema.parse(await request.json());
    const { gallery, error } = await loadGallery(sceneId, galleryId, user.id);
    if (error) return error;
    gallery.title = body.title;
    await gallery.save();
    return NextResponse.json({ id: String(gallery._id), title: gallery.title });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; galleryId: string }> }
) {
  try {
    const { sceneId, galleryId } = await params;
    const user = await requireUser();
    const { gallery, error } = await loadGallery(sceneId, galleryId, user.id);
    if (error) return error;

    const keys = gallery.images.map((image) => image.s3Key);
    await gallery.deleteOne();
    // Borrado de objetos en S3 (best-effort).
    await Promise.all(
      keys.map((Key) =>
        getS3Client()
          .send(new DeleteObjectCommand({ Bucket: getUploadBucket(), Key }))
          .catch(() => null)
      )
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
