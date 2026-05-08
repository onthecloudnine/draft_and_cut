import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { VideoVersion } from "@/models/VideoVersion";

export async function PATCH(
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

    await assertProjectPermission(user.id, String(video.projectId), "video:review");

    video.isFavorite = !video.isFavorite;
    await video.save();

    return NextResponse.json({
      videoVersionId: String(video._id),
      isFavorite: video.isFavorite
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
