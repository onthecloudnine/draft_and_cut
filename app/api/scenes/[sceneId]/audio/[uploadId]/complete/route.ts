import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { AudioVersion } from "@/models/AudioVersion";

const completeAudioSchema = z.object({
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
    const body = completeAudioSchema.parse(await request.json());
    await connectDb();

    const audioVersion = await AudioVersion.findOne({ sceneId, uploadId });

    if (!audioVersion) {
      return jsonError("Audio upload not found", 404);
    }

    if (String(audioVersion.uploadedBy) !== user.id) {
      return jsonError("Forbidden", 403);
    }

    audioVersion.status = body.uploaded ? "ready" : "failed";
    audioVersion.etag = body.etag;
    await audioVersion.save();

    return NextResponse.json({
      audio: {
        id: String(audioVersion._id),
        stem: audioVersion.stem,
        versionNumber: audioVersion.versionNumber,
        fileName: audioVersion.fileName,
        mimeType: audioVersion.mimeType,
        duration: audioVersion.duration,
        createdAt: audioVersion.createdAt?.toISOString(),
        url: body.uploaded ? await maybeGetSignedObjectUrl(audioVersion.s3Key) : null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid complete payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
