import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { jsonError, serializeDocument } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    await assertProjectPermission(user.id, String(scene.projectId), "project:read");

    const shots = await Shot.find({ sceneId }).sort({ shotNumber: 1 }).lean();

    return NextResponse.json({ shots: serializeDocument(shots) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
