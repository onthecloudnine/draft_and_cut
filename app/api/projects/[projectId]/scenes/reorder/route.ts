import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";

const reorderSchema = z.object({
  sceneIds: z.array(z.string().min(1)).min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const body = reorderSchema.parse(await request.json());

    await assertProjectPermission(user.id, projectId, "project:manage");
    await connectDb();

    await Promise.all(
      body.sceneIds.map((sceneId, index) =>
        Scene.updateOne({ _id: sceneId, projectId }, { $set: { sortOrder: index } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid reorder payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
