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

    // Determine temporal order. Prefer ordering by startFrame; fall back to UI order (left earlier).
    const leftStart = typeof leftShot.startFrame === "number" ? leftShot.startFrame : null;
    const rightStart = typeof rightShot.startFrame === "number" ? rightShot.startFrame : null;
    let earlierShot = leftShot;
    if (leftStart !== null && rightStart !== null && rightStart < leftStart) {
      earlierShot = rightShot;
    }

    // Union of the timecode ranges.
    const startCandidates = [leftShot.startFrame, rightShot.startFrame].filter(
      (value): value is number => typeof value === "number"
    );
    const endCandidates = [leftShot.endFrame, rightShot.endFrame].filter(
      (value): value is number => typeof value === "number"
    );

    let mergedStartFrame: number | null =
      startCandidates.length > 0 ? Math.min(...startCandidates) : keepShot.startFrame ?? null;
    let mergedEndFrame: number | null =
      endCandidates.length > 0 ? Math.max(...endCandidates) : keepShot.endFrame ?? null;

    // Mixed case: only one side has timecodes, the other has duration. Extend the range by the
    // missing side's duration so frames are not lost. Direction is implied by the UI left/right.
    const leftHasRange =
      typeof leftShot.startFrame === "number" && typeof leftShot.endFrame === "number";
    const rightHasRange =
      typeof rightShot.startFrame === "number" && typeof rightShot.endFrame === "number";
    if (leftHasRange && !rightHasRange && (rightShot.durationFrames ?? 0) > 0) {
      mergedEndFrame = (mergedEndFrame ?? 0) + (rightShot.durationFrames ?? 0);
    } else if (!leftHasRange && rightHasRange && (leftShot.durationFrames ?? 0) > 0) {
      mergedStartFrame = Math.max(0, (mergedStartFrame ?? 0) - (leftShot.durationFrames ?? 0));
    }

    // durationFrames is derived from the range when both endpoints exist (single source of truth).
    let mergedDurationFrames: number | null = null;
    if (mergedStartFrame !== null && mergedEndFrame !== null && mergedEndFrame >= mergedStartFrame) {
      mergedDurationFrames = mergedEndFrame - mergedStartFrame;
    } else {
      const a = leftShot.durationFrames ?? 0;
      const b = rightShot.durationFrames ?? 0;
      mergedDurationFrames = a + b > 0 ? a + b : keepShot.durationFrames ?? null;
    }

    // shotNumber follows the earliest shot so the resulting number matches its temporal position.
    const mergedShotNumber = earlierShot.shotNumber;

    // Reassign videos first, then delete the dropped shot. This frees its shotNumber in case the
    // merged shotNumber comes from the dropped side (unique index on scriptVersionId+sceneNumber+shotNumber).
    await VideoVersion.updateMany(
      { sceneId, shotId: dropShot._id },
      { $set: { shotId: keepShot._id } }
    );
    await Shot.deleteOne({ _id: dropShot._id });

    if (mergedStartFrame !== null) {
      keepShot.startFrame = mergedStartFrame;
    } else {
      keepShot.set("startFrame", undefined);
    }
    if (mergedEndFrame !== null) {
      keepShot.endFrame = mergedEndFrame;
    } else {
      keepShot.set("endFrame", undefined);
    }
    if (mergedDurationFrames !== null) {
      keepShot.durationFrames = mergedDurationFrames;
    } else {
      keepShot.set("durationFrames", undefined);
    }
    keepShot.shotNumber = mergedShotNumber;
    await keepShot.save();

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
