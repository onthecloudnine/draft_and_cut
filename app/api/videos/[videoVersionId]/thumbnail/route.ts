import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client } from "@/lib/s3/client";
import { deriveThumbnailKeyFromVideoKey } from "@/lib/s3/keys";
import { buildPutObjectUpload } from "@/lib/s3/upload";
import { jsonError } from "@/lib/api/http";
import { VideoVersion } from "@/models/VideoVersion";

const confirmSchema = z.object({
  thumbnailKey: z.string().min(1)
});

export async function POST(
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

    const thumbnailKey = video.thumbnailKey ?? deriveThumbnailKeyFromVideoKey(video.s3Key);
    const { command, uploadHeaders } = buildPutObjectUpload({
      key: thumbnailKey,
      contentType: "image/jpeg"
    });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 10 });

    return NextResponse.json({ thumbnailKey, uploadUrl, uploadHeaders });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ videoVersionId: string }> }
) {
  try {
    const { videoVersionId } = await params;
    const user = await requireUser();
    const body = confirmSchema.parse(await request.json());
    await connectDb();

    const video = await VideoVersion.findById(videoVersionId);

    if (!video) {
      return jsonError("Video version not found", 404);
    }

    await assertProjectPermission(user.id, String(video.projectId), "project:read");

    video.thumbnailKey = body.thumbnailKey;
    await video.save();

    return NextResponse.json({ thumbnailKey: video.thumbnailKey });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
