import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { SceneAttachment } from "@/models/SceneAttachment";
import { User } from "@/models/User";

const completeAttachmentSchema = z.object({
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
    const body = completeAttachmentSchema.parse(await request.json());
    await connectDb();

    const attachment = await SceneAttachment.findOne({ sceneId, uploadId });

    if (!attachment) {
      return jsonError("Attachment upload not found", 404);
    }

    if (String(attachment.uploadedBy) !== user.id) {
      return jsonError("Forbidden", 403);
    }

    attachment.status = body.uploaded ? "ready" : "failed";
    attachment.etag = body.etag;
    await attachment.save();

    const uploader = await User.findById(attachment.uploadedBy).select("name email").lean();

    return NextResponse.json({
      attachment: {
        id: String(attachment._id),
        title: attachment.title,
        description: attachment.description,
        attachmentDate: attachment.attachmentDate.toISOString(),
        fileName: attachment.fileName,
        fileSizeMb: attachment.fileSizeMb,
        mimeType: attachment.mimeType,
        uploadedByName: uploader?.name ?? uploader?.email ?? "Usuario",
        createdAt: attachment.createdAt?.toISOString(),
        url: body.uploaded ? await maybeGetSignedObjectUrl(attachment.s3Key) : null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid complete payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
