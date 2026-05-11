import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { VideoVersion } from "@/models/VideoVersion";
import { jsonError, serializeDocument } from "@/lib/api/http";
import { Comment } from "@/models/Comment";
import { Scene } from "@/models/Scene";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoVersionId: string }> }
) {
  try {
    const { videoVersionId } = await params;
    const user = await requireUser();
    await connectDb();

    const video = await VideoVersion.findById(videoVersionId).lean();

    if (!video) {
      return jsonError("Video version not found", 404);
    }

    await assertProjectPermission(user.id, String(video.projectId), "project:read");

    return NextResponse.json({ video: serializeDocument(video) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ videoVersionId: string }> }
) {
  try {
    const { videoVersionId } = await params;
    const user = await requireUser();
    await connectDb();

    const video = await VideoVersion.findById(videoVersionId);

    if (!video) {
      return jsonError("Video version not found", 404);
    }

    await assertProjectPermission(user.id, String(video.projectId), "project:manage");

    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getUploadBucket(),
        Key: video.s3Key
      })
    );

    const [scene, fallbackVideo] = await Promise.all([
      Scene.findById(video.sceneId),
      VideoVersion.findOne({
        _id: { $ne: video._id },
        sceneId: video.sceneId,
        status: "ready_for_review"
      }).sort({ isFavorite: -1, createdAt: -1 })
    ]);

    await Promise.all([
      Comment.deleteMany({ videoVersionId: video._id }),
      VideoVersion.deleteOne({ _id: video._id }),
      scene && String(scene.currentVideoVersionId) === String(video._id)
        ? Scene.updateOne(
            { _id: scene._id },
            { currentVideoVersionId: fallbackVideo?._id ?? null }
          )
        : Promise.resolve()
    ]);

    return NextResponse.json({
      deletedVideoVersionId: videoVersionId,
      nextVideoVersionId: fallbackVideo ? String(fallbackVideo._id) : null
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
