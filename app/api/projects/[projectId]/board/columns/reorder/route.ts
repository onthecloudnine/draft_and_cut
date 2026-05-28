import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardColumn } from "@/models/BoardColumn";

const schema = z.object({
  columnIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(50)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(projectId)) return jsonError("Invalid id", 400);
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    const body = schema.parse(await request.json());
    await connectDb();
    await Promise.all(
      body.columnIds.map((columnId, index) =>
        BoardColumn.updateOne({ _id: columnId, projectId }, { $set: { sortOrder: index } })
      )
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
