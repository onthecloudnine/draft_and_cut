import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardColumn } from "@/models/BoardColumn";
import { BoardCard } from "@/models/BoardCard";
import { BoardCardComment } from "@/models/BoardCardComment";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; columnId: string }> }
) {
  try {
    const { projectId, columnId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(columnId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    const body = patchSchema.parse(await request.json());
    await connectDb();
    const column = await BoardColumn.findOneAndUpdate(
      { _id: columnId, projectId },
      { $set: body },
      { new: true }
    ).lean();
    if (!column) return jsonError("Column not found", 404);
    return NextResponse.json({
      column: {
        id: String(column._id),
        name: column.name,
        color: column.color ?? "",
        sortOrder: column.sortOrder ?? 0
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; columnId: string }> }
) {
  try {
    const { projectId, columnId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(columnId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    await connectDb();
    const cardsInColumn = await BoardCard.find({ projectId, columnId }).select("_id").lean();
    const cardIds = cardsInColumn.map((card) => card._id);
    await Promise.all([
      BoardCardComment.deleteMany({ cardId: { $in: cardIds } }),
      BoardCard.deleteMany({ projectId, columnId }),
      BoardColumn.deleteOne({ _id: columnId, projectId })
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
