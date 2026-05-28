import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardCard } from "@/models/BoardCard";
import { BoardCardComment } from "@/models/BoardCardComment";
import { User } from "@/models/User";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; cardId: string }> }
) {
  try {
    const { projectId, cardId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(cardId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    await connectDb();
    const card = await BoardCard.findOne({ _id: cardId, projectId }).select("_id").lean();
    if (!card) return jsonError("Card not found", 404);
    const comments = await BoardCardComment.find({ cardId }).sort({ createdAt: 1 }).lean();
    const authorIds = Array.from(new Set(comments.map((c) => String(c.createdBy))));
    const authors = await User.find({ _id: { $in: authorIds } }).select("name email").lean();
    const authorById = new Map(authors.map((author) => [String(author._id), author]));
    return NextResponse.json({
      comments: comments.map((comment) => {
        const author = authorById.get(String(comment.createdBy));
        return {
          id: String(comment._id),
          text: comment.text,
          createdAt: comment.createdAt?.toISOString() ?? new Date().toISOString(),
          authorId: String(comment.createdBy),
          authorName: author?.name ?? author?.email ?? "—"
        };
      })
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

const postSchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; cardId: string }> }
) {
  try {
    const { projectId, cardId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(cardId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    const body = postSchema.parse(await request.json());
    await connectDb();
    const card = await BoardCard.findOne({ _id: cardId, projectId }).select("_id").lean();
    if (!card) return jsonError("Card not found", 404);
    const comment = await BoardCardComment.create({
      projectId,
      cardId,
      text: body.text,
      createdBy: user.id
    });
    const author = await User.findById(user.id).select("name email").lean();
    return NextResponse.json({
      comment: {
        id: String(comment._id),
        text: comment.text,
        createdAt: comment.createdAt?.toISOString() ?? new Date().toISOString(),
        authorId: String(user.id),
        authorName: author?.name ?? author?.email ?? "—"
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
