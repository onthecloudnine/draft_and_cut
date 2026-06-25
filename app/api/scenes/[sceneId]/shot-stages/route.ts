import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { ShotStageState } from "@/models/ShotStageState";
import { sceneStages, sceneStatuses } from "@/types/domain";

const bodySchema = z.object({
  shotId: z.string().min(1),
  stage: z.enum(sceneStages),
  reviewStatus: z.enum(sceneStatuses).optional(),
  assignees: z.array(z.string().min(1)).optional()
});

// Upserts the review/approval status and assignees ("responsables") for a
// (shot × stage). The clip for the stage lives in VideoVersion(shotId, stage).
export async function POST(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = bodySchema.parse(await request.json());
    await connectDb();

    const scene = await Scene.findById(sceneId).select("projectId").lean();
    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "script:manage");
    if (role !== "admin") {
      return jsonError("Only admin users can edit shot stages", 403);
    }

    const shot = await Shot.findOne({ _id: body.shotId, sceneId }).select("_id").lean();
    if (!shot) {
      return jsonError("Shot does not belong to scene", 400);
    }

    const update: Record<string, unknown> = {};
    if (body.reviewStatus !== undefined) update.reviewStatus = body.reviewStatus;
    if (body.assignees !== undefined) update.assignees = body.assignees;

    const state = await ShotStageState.findOneAndUpdate(
      { shotId: body.shotId, stage: body.stage },
      {
        $set: update,
        $setOnInsert: { projectId: scene.projectId, sceneId, shotId: body.shotId, stage: body.stage }
      },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({
      stageState: {
        id: String(state._id),
        shotId: String(state.shotId),
        stage: state.stage,
        reviewStatus: state.reviewStatus ?? "draft",
        assignees: (state.assignees ?? []).map((id) => String(id))
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid payload", 400);
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
