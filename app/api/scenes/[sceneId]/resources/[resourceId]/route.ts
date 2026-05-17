import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";
import { productionStages } from "@/types/domain";

const patchSchema = z.object({
  stages: z.array(z.enum(productionStages))
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sceneId: string; resourceId: string }> }
) {
  try {
    const { sceneId, resourceId } = await params;
    const user = await requireUser();
    const body = patchSchema.parse(await request.json());
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();
    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "project:manage");
    if (role !== "admin") {
      return jsonError("Only admin users can update human resources", 403);
    }

    const stages = Array.from(new Set(body.stages));
    const assignment = await SceneResourceAssignment.findOneAndUpdate(
      { _id: resourceId, sceneId },
      { $set: { stages } },
      { new: true }
    ).lean();

    if (!assignment) {
      return jsonError("Resource not found", 404);
    }

    return NextResponse.json({ stages: assignment.stages ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; resourceId: string }> }
) {
  try {
    const { sceneId, resourceId } = await params;
    const user = await requireUser();
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "project:manage");

    if (role !== "admin") {
      return jsonError("Only admin users can remove human resources", 403);
    }

    await SceneResourceAssignment.deleteOne({ _id: resourceId, sceneId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
