import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardLabel } from "@/models/BoardLabel";
import { BoardCard } from "@/models/BoardCard";

const patchSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; labelId: string }> }
) {
  try {
    const { projectId, labelId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(labelId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    const body = patchSchema.parse(await request.json());
    await connectDb();
    const label = await BoardLabel.findOneAndUpdate(
      { _id: labelId, projectId },
      { $set: body },
      { new: true }
    ).lean();
    if (!label) return jsonError("Label not found", 404);
    return NextResponse.json({
      label: { id: String(label._id), name: label.name, color: label.color ?? "#3b82f6" }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; labelId: string }> }
) {
  try {
    const { projectId, labelId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId) || !/^[a-f0-9]{24}$/i.test(labelId)) {
      return jsonError("Invalid id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    await connectDb();
    await Promise.all([
      BoardCard.updateMany({ projectId, labelIds: labelId }, { $pull: { labelIds: labelId } }),
      BoardLabel.deleteOne({ _id: labelId, projectId })
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
