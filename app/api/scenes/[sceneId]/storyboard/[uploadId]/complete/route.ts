import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { StoryboardFrame } from "@/models/StoryboardFrame";

const completeStoryboardSchema = z.object({
  uploaded: z.boolean(),
  etag: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string; uploadId: string }> }
) {
  try {
    const { sceneId, uploadId } = await params;
    const user = await requireUser();
    const body = completeStoryboardSchema.parse(await request.json());
    await connectDb();

    const frame = await StoryboardFrame.findOne({ sceneId, uploadId });

    if (!frame) {
      return jsonError("Storyboard upload not found", 404);
    }

    if (String(frame.uploadedBy) !== user.id) {
      return jsonError("Forbidden", 403);
    }

    frame.status = body.uploaded ? "ready" : "failed";
    frame.etag = body.etag;
    await frame.save();

    return NextResponse.json({
      frame: {
        id: String(frame._id),
        shotId: String(frame.shotId),
        versionNumber: frame.versionNumber,
        fileName: frame.fileName,
        mimeType: frame.mimeType,
        width: frame.width ?? null,
        height: frame.height ?? null,
        createdAt: frame.createdAt?.toISOString(),
        url: body.uploaded ? await maybeGetSignedObjectUrl(frame.s3Key) : null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid complete payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
