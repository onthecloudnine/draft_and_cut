import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";

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
