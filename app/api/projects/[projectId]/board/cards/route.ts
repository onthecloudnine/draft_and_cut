import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardCard } from "@/models/BoardCard";
import { BoardColumn } from "@/models/BoardColumn";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

const schema = z.object({
  columnId: objectId,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().default(""),
  assigneeUserId: objectId.nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  sceneId: objectId.nullable().optional(),
  shotId: objectId.nullable().optional(),
  labelIds: z.array(objectId).optional().default([])
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId)) return jsonError("Invalid id", 400);
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    const body = schema.parse(await request.json());
    await connectDb();
    const column = await BoardColumn.findOne({ _id: body.columnId, projectId }).select("_id").lean();
    if (!column) return jsonError("Column not found", 404);
    const last = await BoardCard.findOne({ projectId, columnId: body.columnId })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean();
    const card = await BoardCard.create({
      projectId,
      columnId: body.columnId,
      title: body.title,
      description: body.description,
      assigneeUserId: body.assigneeUserId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      sceneId: body.sceneId ?? null,
      shotId: body.shotId ?? null,
      labelIds: body.labelIds,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: user.id
    });
    return NextResponse.json({
      card: {
        id: String(card._id),
        columnId: String(card.columnId),
        title: card.title,
        description: card.description ?? "",
        assigneeUserId: card.assigneeUserId ? String(card.assigneeUserId) : null,
        assigneeName: null,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        sceneId: card.sceneId ? String(card.sceneId) : null,
        shotId: card.shotId ? String(card.shotId) : null,
        labelIds: (card.labelIds ?? []).map((id: unknown) => String(id)),
        checklist: [],
        sortOrder: card.sortOrder ?? 0
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
