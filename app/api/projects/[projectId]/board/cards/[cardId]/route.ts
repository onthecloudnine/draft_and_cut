import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardCard } from "@/models/BoardCard";
import { BoardCardComment } from "@/models/BoardCardComment";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

const patchSchema = z.object({
  columnId: objectId.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  assigneeUserId: objectId.nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  sceneId: objectId.nullable().optional(),
  shotId: objectId.nullable().optional(),
  labelIds: z.array(objectId).optional(),
  checklist: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(400),
        done: z.boolean()
      })
    )
    .max(100)
    .optional(),
  sortOrder: z.number().optional()
});

export async function PATCH(
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
    const body = patchSchema.parse(await request.json());
    await connectDb();
    const update: Record<string, unknown> = { ...body };
    if (body.dueDate !== undefined) {
      update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    const card = await BoardCard.findOneAndUpdate(
      { _id: cardId, projectId },
      { $set: update },
      { new: true }
    ).lean();
    if (!card) return jsonError("Card not found", 404);
    return NextResponse.json({
      card: {
        id: String(card._id),
        columnId: String(card.columnId),
        title: card.title,
        description: card.description ?? "",
        assigneeUserId: card.assigneeUserId ? String(card.assigneeUserId) : null,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        sceneId: card.sceneId ? String(card.sceneId) : null,
        shotId: card.shotId ? String(card.shotId) : null,
        labelIds: (card.labelIds ?? []).map((id: unknown) => String(id)),
        checklist: (card.checklist ?? []).map((item: { id?: string; text?: string; done?: boolean }) => ({
          id: String(item.id ?? ""),
          text: String(item.text ?? ""),
          done: Boolean(item.done)
        })),
        sortOrder: card.sortOrder ?? 0
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
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
    await Promise.all([
      BoardCardComment.deleteMany({ cardId }),
      BoardCard.deleteOne({ _id: cardId, projectId })
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
