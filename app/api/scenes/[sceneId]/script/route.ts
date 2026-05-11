import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Scene } from "@/models/Scene";
import { ScriptVersion } from "@/models/ScriptVersion";
import { Shot } from "@/models/Shot";
import { sceneSoundOptions, shotStatuses, type SceneSoundOption } from "@/types/domain";

const shotInputSchema = z.object({
  id: z.string().min(1).optional(),
  shotNumber: z.string().min(1),
  shotType: z.string().optional().default(""),
  status: z.enum(shotStatuses).optional().default("animatic"),
  description: z.string().optional().default(""),
  action: z.string().optional().default(""),
  camera: z.string().optional().default(""),
  sound: z.string().optional().default(""),
  requiredElements: z.array(z.string()).optional().default([]),
  productionNotes: z.string().optional().default(""),
  durationFrames: z.number().int().nonnegative().nullable().optional().default(null)
});

const scriptUpdateSchema = z.object({
  scene: z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    location: z.string().optional().default(""),
    timeOfDay: z.string().optional().default(""),
    soundOptions: z.array(z.enum(sceneSoundOptions)).optional().default(["none"])
  }),
  shots: z.array(shotInputSchema)
});

type ScriptShotInput = z.infer<typeof shotInputSchema>;

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

async function getWritableScriptVersionId(projectId: string, createdBy: string, currentScriptVersionId?: unknown) {
  if (currentScriptVersionId) {
    return currentScriptVersionId;
  }

  const activeScriptVersion = await ScriptVersion.findOne({ projectId, status: "active" }).lean();

  if (activeScriptVersion?._id) {
    return activeScriptVersion._id;
  }

  const latestScriptVersion = await ScriptVersion.findOne({ projectId }).sort({ versionNumber: -1 }).lean();
  const scriptVersion = await ScriptVersion.create({
    projectId,
    versionNumber: (latestScriptVersion?.versionNumber ?? 0) + 1,
    status: "active",
    source: "manual",
    changeSummary: "Edicion manual de shots.",
    createdBy
  });

  return scriptVersion._id;
}

function buildShotUpdate(shot: ScriptShotInput) {
  return {
    shotNumber: shot.shotNumber,
    shotType: shot.shotType,
    status: shot.status,
    description: shot.description,
    action: shot.action,
    camera: shot.camera,
    sound: shot.sound,
    requiredElements: shot.requiredElements.map((item) => item.trim()).filter(Boolean),
    productionNotes: shot.productionNotes,
    durationFrames: shot.durationFrames
  };
}

function normalizeSceneSoundOptions(options: SceneSoundOption[]) {
  const uniqueOptions = Array.from(new Set(options));
  const selectedOptions = uniqueOptions.filter((option) => option !== "none");

  return selectedOptions.length > 0 ? selectedOptions : ["none"];
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = scriptUpdateSchema.parse(await request.json());
    await connectDb();

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "script:manage");

    if (role !== "admin") {
      return jsonError("Only admin users can edit the technical script", 403);
    }

    const shotIds = body.shots.flatMap((shot) => (shot.id ? [shot.id] : []));
    const existingShots = await Shot.find({ _id: { $in: shotIds }, sceneId }).select("_id").lean();

    if (existingShots.length !== shotIds.length) {
      return jsonError("One or more shots do not belong to this scene", 400);
    }

    const scriptVersionId = await getWritableScriptVersionId(
      String(scene.projectId),
      user.id,
      scene.currentScriptVersionId
    );

    await Scene.findByIdAndUpdate(sceneId, {
      title: body.scene.title,
      description: body.scene.description,
      location: body.scene.location,
      timeOfDay: body.scene.timeOfDay,
      soundOptions: normalizeSceneSoundOptions(body.scene.soundOptions),
      currentScriptVersionId: scriptVersionId
    });

    const keptShotIds = new Set<string>();

    for (const shot of body.shots) {
      if (shot.id) {
        await Shot.findByIdAndUpdate(shot.id, buildShotUpdate(shot));
        keptShotIds.add(shot.id);
        continue;
      }

      const createdShot = await Shot.create({
        projectId: scene.projectId,
        sceneId,
        scriptVersionId,
        sceneNumber: scene.sceneNumber,
        ...buildShotUpdate(shot)
      });
      keptShotIds.add(String(createdShot._id));
    }

    const shotsToDelete = await Shot.find({
      sceneId,
      _id: { $nin: Array.from(keptShotIds) }
    })
      .select("_id")
      .lean();

    if (shotsToDelete.length > 0) {
      await Shot.deleteMany({ _id: { $in: shotsToDelete.map((shot) => shot._id) } });
    }

    const updatedShots = await Shot.find({ sceneId }).sort({ shotNumber: 1 }).lean();
    updatedShots.sort((left, right) =>
      left.shotNumber.localeCompare(right.shotNumber, undefined, { numeric: true, sensitivity: "base" })
    );

    return NextResponse.json({ ok: true, shots: updatedShots.map(serializeShot) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid script payload", 400);
    }

    if (error instanceof Error && "code" in error && error.code === 11000) {
      return jsonError("Ya existe un shot con ese numero en esta version de guion.", 409);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
