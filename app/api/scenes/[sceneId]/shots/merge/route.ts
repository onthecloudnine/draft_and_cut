import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { VideoVersion } from "@/models/VideoVersion";

const mergeSchema = z.object({
  leftId: z.string().min(1),
  rightId: z.string().min(1),
  keep: z.enum(["left", "right"])
});

function serializeShot(shot: {
  _id: unknown;
  shotNumber: string;
  shotType: string;
  status?: string;
  description: string;
  action: string;
  camera: string;
  sound: string;
  requiredElements: string[];
  productionNotes: string;
  durationFrames?: number | null;
  startFrame?: number | null;
  endFrame?: number | null;
}) {
  return {
    id: String(shot._id),
    shotNumber: shot.shotNumber,
    shotType: shot.shotType,
    status: shot.status ?? "animatic",
    description: shot.description,
    action: shot.action,
    camera: shot.camera,
    sound: shot.sound,
    requiredElements: shot.requiredElements,
    productionNotes: shot.productionNotes,
    durationFrames: shot.durationFrames ?? null,
    startFrame: shot.startFrame ?? null,
    endFrame: shot.endFrame ?? null
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = mergeSchema.parse(await request.json());
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();
    if (!scene) return jsonError("Scene not found", 404);

    const role = await assertProjectPermission(user.id, String(scene.projectId), "script:manage");
    if (role !== "admin") return jsonError("Only admin users can merge shots", 403);

    if (body.leftId === body.rightId) {
      return jsonError("leftId and rightId must differ", 400);
    }

    const [leftShot, rightShot] = await Promise.all([
      Shot.findOne({ _id: body.leftId, sceneId }),
      Shot.findOne({ _id: body.rightId, sceneId })
    ]);

    if (!leftShot || !rightShot) {
      return jsonError("One or more shots do not belong to this scene", 400);
    }

    const keepShot = body.keep === "left" ? leftShot : rightShot;
    const dropShot = body.keep === "left" ? rightShot : leftShot;

    const startCandidates = [leftShot.startFrame, rightShot.startFrame].filter(
      (value): value is number => typeof value === "number"
    );
    const endCandidates = [leftShot.endFrame, rightShot.endFrame].filter(
      (value): value is number => typeof value === "number"
    );

    const mergedStartFrame = startCandidates.length > 0 ? Math.min(...startCandidates) : keepShot.startFrame ?? null;
    const mergedEndFrame = endCandidates.length > 0 ? Math.max(...endCandidates) : keepShot.endFrame ?? null;

    let mergedDurationFrames: number | null = null;
    if (mergedStartFrame !== null && mergedEndFrame !== null && mergedEndFrame >= mergedStartFrame) {
      mergedDurationFrames = mergedEndFrame - mergedStartFrame;
    } else {
      const a = leftShot.durationFrames ?? 0;
      const b = rightShot.durationFrames ?? 0;
      mergedDurationFrames = a + b > 0 ? a + b : keepShot.durationFrames ?? null;
    }

    keepShot.startFrame = mergedStartFrame ?? undefined;
    keepShot.endFrame = mergedEndFrame ?? undefined;
    keepShot.durationFrames = mergedDurationFrames ?? undefined;
    await keepShot.save();

    await VideoVersion.updateMany(
      { sceneId, shotId: dropShot._id },
      { $set: { shotId: keepShot._id } }
    );

    await Shot.deleteOne({ _id: dropShot._id });

    const updatedShots = await Shot.find({ sceneId }).lean();
    updatedShots.sort((left, right) =>
      left.shotNumber.localeCompare(right.shotNumber, undefined, { numeric: true, sensitivity: "base" })
    );

    return NextResponse.json({
      ok: true,
      keptShotId: String(keepShot._id),
      shots: updatedShots.map(serializeShot)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid merge payload", 400);
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
