import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { VideoVersion } from "@/models/VideoVersion";

const completeUploadSchema = z.object({
  uploaded: z.boolean(),
  etag: z.string().optional(),
  thumbnailUploaded: z.boolean().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId } = await params;
    const user = await requireUser();
    const body = completeUploadSchema.parse(await request.json());
    await connectDb();

    const videoVersion = await VideoVersion.findOne({ uploadId });

    if (!videoVersion) {
      return jsonError("Upload not found", 404);
    }

    if (String(videoVersion.uploadedBy) !== user.id) {
      return jsonError("Forbidden", 403);
    }

    videoVersion.status = body.uploaded ? "ready_for_review" : "failed";
    videoVersion.etag = body.etag;
    if (body.thumbnailUploaded === false) {
      videoVersion.thumbnailKey = null;
    }
    await videoVersion.save();

    if (body.uploaded) {
      await Scene.findByIdAndUpdate(videoVersion.sceneId, {
        currentVideoVersionId: videoVersion._id,
        currentScriptVersionId: videoVersion.scriptVersionId
      });
    }

    return NextResponse.json({
      status: videoVersion.status,
      videoVersionId: String(videoVersion._id)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid complete payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
