import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { VideoVersion } from "@/models/VideoVersion";
import { jsonError, serializeDocument } from "@/lib/api/http";

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
