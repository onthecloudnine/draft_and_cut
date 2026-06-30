import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { ArtReference } from "@/models/ArtReference";
import { Scene } from "@/models/Scene";

const completeSchema = z.object({
  galleryId: z.string().min(1),
  imageId: z.string().min(1),
  uploaded: z.boolean()
});

export async function POST(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = completeSchema.parse(await request.json());

    await connectDb();
    const scene = await Scene.findById(sceneId).lean();
    if (!scene) return jsonError("Scene not found", 404);
    const role = await assertProjectPermission(user.id, String(scene.projectId), "video:upload");
    if (role !== "admin") return jsonError("Forbidden", 403);

    const gallery = await ArtReference.findById(body.galleryId);
    if (!gallery || String(gallery.sceneId) !== sceneId) return jsonError("Gallery not found", 404);
    const image = gallery.images.id(body.imageId);
    if (!image) return jsonError("Image not found", 404);

    if (body.uploaded) {
      image.status = "ready";
      await gallery.save();
      return NextResponse.json({
        image: { id: String(image._id), fileName: image.fileName, url: await maybeGetSignedObjectUrl(image.s3Key) }
      });
    }

    image.deleteOne();
    await gallery.save();
    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
