import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardCardComment } from "@/models/BoardCardComment";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; cardId: string; commentId: string }> }
) {
  try {
    const { projectId, cardId, commentId } = await params;
    if (
      !/^[a-f0-9]{24}$/i.test(projectId) ||
      !/^[a-f0-9]{24}$/i.test(cardId) ||
      !/^[a-f0-9]{24}$/i.test(commentId)
    ) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    await connectDb();
    const comment = await BoardCardComment.findOne({
      _id: commentId,
      cardId,
      projectId
    }).select("createdBy");
    if (!comment) return jsonError("Comment not found", 404);
    // Only the author can delete their own comment.
    if (String(comment.createdBy) !== String(user.id)) {
      return jsonError("Forbidden", 403);
    }
    await BoardCardComment.deleteOne({ _id: commentId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
