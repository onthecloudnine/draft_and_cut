import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardColumn } from "@/models/BoardColumn";

const schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional().default("")
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    if (!projectId || !/^[a-f0-9]{24}$/i.test(projectId)) return jsonError("Invalid id", 400);
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:manage");
    const body = schema.parse(await request.json());
    await connectDb();
    const last = await BoardColumn.findOne({ projectId }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const column = await BoardColumn.create({
      projectId,
      name: body.name,
      color: body.color,
      sortOrder: (last?.sortOrder ?? -1) + 1
    });
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
