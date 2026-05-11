import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { SceneAssetTag } from "@/models/SceneAssetTag";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; assignmentId: string }> }
) {
  try {
    const { sceneId, assignmentId } = await params;
    const user = await requireUser();
    await connectDb();

    const scene = await Scene.findById(sceneId).select("projectId").lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "script:manage");

    if (role !== "admin") {
      return jsonError("Only admin users can remove scene tags", 403);
    }

    await SceneAssetTag.deleteOne({ _id: assignmentId, sceneId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
