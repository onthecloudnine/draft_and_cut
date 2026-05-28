import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { BoardLabel } from "@/models/BoardLabel";

const schema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6")
});

export async function POST(
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
    const label = await BoardLabel.create({ projectId, name: body.name, color: body.color });
    return NextResponse.json({
      label: { id: String(label._id), name: label.name, color: label.color ?? "#3b82f6" }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
