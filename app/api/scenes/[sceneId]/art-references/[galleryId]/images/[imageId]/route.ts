import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { ArtReference } from "@/models/ArtReference";
import { Scene } from "@/models/Scene";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; galleryId: string; imageId: string }> }
) {
  try {
    const { sceneId, galleryId, imageId } = await params;
    const user = await requireUser();
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();
    if (!scene) return jsonError("Scene not found", 404);
    const role = await assertProjectPermission(user.id, String(scene.projectId), "video:upload");
    if (role !== "admin") return jsonError("Forbidden", 403);

    const gallery = await ArtReference.findById(galleryId);
    if (!gallery || String(gallery.sceneId) !== sceneId) return jsonError("Gallery not found", 404);
    const image = gallery.images.id(imageId);
    if (!image) return jsonError("Image not found", 404);

    const key = image.s3Key;
    image.deleteOne();
    // Si la galería queda vacía, se elimina la versión completa.
    const galleryEmptied = gallery.images.length === 0;
    if (galleryEmptied) {
      await gallery.deleteOne();
    } else {
      await gallery.save();
    }
    await getS3Client()
      .send(new DeleteObjectCommand({ Bucket: getUploadBucket(), Key: key }))
      .catch(() => null);

    return NextResponse.json({ deleted: true, galleryDeleted: galleryEmptied });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
