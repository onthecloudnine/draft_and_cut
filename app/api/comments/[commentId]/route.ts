import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Comment } from "@/models/Comment";
import { commentPriorities, commentStatuses } from "@/types/domain";

const updateCommentSchema = z.object({
  status: z.enum(commentStatuses).optional(),
  priority: z.enum(commentPriorities).optional(),
  text: z.string().min(1).optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const user = await requireUser();
    const body = updateCommentSchema.parse(await request.json());
    await connectDb();

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return jsonError("Comment not found", 404);
    }

    await assertProjectPermission(user.id, String(comment.projectId), "comment:resolve");

    if (body.text) {
      comment.text = body.text;
    }

    if (body.priority) {
      comment.priority = body.priority;
    }

    if (body.status) {
      comment.status = body.status;
      comment.resolvedAt = body.status === "resolved" ? new Date() : undefined;
    }

    await comment.save();

    return NextResponse.json({
      comment: {
        id: String(comment._id),
        frame: comment.frame,
        timeSeconds: comment.timeSeconds,
        timecode: comment.timecode,
        text: comment.text,
        status: comment.status,
        priority: comment.priority
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid comment payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
