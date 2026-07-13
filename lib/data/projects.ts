import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { User } from "@/models/User";
import { VideoVersion } from "@/models/VideoVersion";
import { Comment } from "@/models/Comment";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";

function compareNumericText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

type LatestVideoAgg = {
  _id: unknown;
  videoId: unknown;
  versionNumber: number;
  stage: string;
  status: string;
  createdAt?: Date;
  s3Key?: string;
  mimeType?: string | null;
  duration?: number | null;
  thumbnailKey?: string | null;
};

type SceneCountAgg = { _id: unknown; count: number };

export async function getAllProjectsForAdmin() {
  await connectDb();
  const projects = await Project.find({}).sort({ title: 1 }).lean();
  const sceneCounts = await Scene.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: "$projectId", count: { $sum: 1 } } }
  ]);
  const sceneCountByProject = new Map(sceneCounts.map((row) => [String(row._id), row.count]));

  return projects.map((project) => ({
    id: String(project._id),
    slug: project.slug,
    title: project.title,
    description: project.description,
    fpsDefault: project.fpsDefault,
    sceneCount: sceneCountByProject.get(String(project._id)) ?? 0,
    createdAt: project.createdAt?.toISOString(),
    updatedAt: project.updatedAt?.toISOString()
  }));
}

export async function getProjectsForUser(userId: string) {
  await connectDb();

  const [user, memberships] = await Promise.all([
    User.findById(userId).select("accountRole").lean(),
    ProjectMembership.find({ userId }).lean()
  ]);
  const isGlobalAdmin = user?.accountRole === "admin";

  const projects = isGlobalAdmin
    ? await Project.find({}).sort({ title: 1 }).lean()
    : await Project.find({ _id: { $in: memberships.map((m) => m.projectId) } })
        .sort({ title: 1 })
        .lean();

  return projects.map((project) => {
    const membership = memberships.find(
      (item) => String(item.projectId) === String(project._id)
    );

    return {
      id: String(project._id),
      slug: project.slug,
      title: project.title,
      description: project.description,
      fpsDefault: project.fpsDefault,
      role: membership?.role ?? (isGlobalAdmin ? "admin" : "read_only")
    };
  });
}

export async function getProjectSceneSummaries(projectId: string) {
  await connectDb();

  const scenes = await Scene.find({ projectId }).sort({ sceneNumber: 1 }).lean();
  scenes.sort((left, right) => compareNumericText(left.sceneNumber, right.sceneNumber));
  const sceneIds = scenes.map((scene) => scene._id);
  const shots = await Shot.find({ projectId, sceneId: { $in: sceneIds } })
    .sort({ sceneNumber: 1, shotNumber: 1 })
    .lean();
  shots.sort(
    (left, right) =>
      compareNumericText(left.sceneNumber, right.sceneNumber) ||
      compareNumericText(left.shotNumber, right.shotNumber)
  );
  const shotsByScene = new Map<string, typeof shots>();

  for (const shot of shots) {
    const key = String(shot.sceneId);
    shotsByScene.set(key, [...(shotsByScene.get(key) ?? []), shot]);
  }

  // Clips por plano (para reproducir secuencialmente todos los planos del proyecto).
  const shotClips = await VideoVersion.find({
    projectId,
    scope: "shot",
    status: "ready_for_review",
    shotId: { $in: shots.map((shot) => shot._id) }
  })
    .select("shotId stage versionNumber s3Key")
    .lean();
  const latestClipByShotStage = new Map<string, { versionNumber: number; s3Key: string }>();
  for (const clip of shotClips) {
    if (!clip.s3Key) continue;
    const key = `${String(clip.shotId)}:${clip.stage}`;
    const current = latestClipByShotStage.get(key);
    if (!current || clip.versionNumber > current.versionNumber) {
      latestClipByShotStage.set(key, { versionNumber: clip.versionNumber, s3Key: clip.s3Key });
    }
  }

  // Agregados por escena en 3 queries (antes eran 3 por escena → N+1): último
  // video, comentarios abiertos y total de videos.
  const [latestVideoRows, openCommentRows, videoCountRows] = await Promise.all([
    VideoVersion.aggregate<LatestVideoAgg>([
      { $match: { sceneId: { $in: sceneIds } } },
      // _id como desempate: ante createdAt iguales gana el insertado más reciente.
      { $sort: { sceneId: 1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$sceneId",
          videoId: { $first: "$_id" },
          versionNumber: { $first: "$versionNumber" },
          stage: { $first: "$stage" },
          status: { $first: "$status" },
          createdAt: { $first: "$createdAt" },
          s3Key: { $first: "$s3Key" },
          mimeType: { $first: "$mimeType" },
          duration: { $first: "$duration" },
          thumbnailKey: { $first: "$thumbnailKey" }
        }
      }
    ]),
    Comment.aggregate<SceneCountAgg>([
      { $match: { sceneId: { $in: sceneIds }, status: { $in: ["open", "in_progress"] } } },
      { $group: { _id: "$sceneId", count: { $sum: 1 } } }
    ]),
    VideoVersion.aggregate<SceneCountAgg>([
      { $match: { sceneId: { $in: sceneIds } } },
      { $group: { _id: "$sceneId", count: { $sum: 1 } } }
    ])
  ]);
  const latestVideoByScene = new Map(latestVideoRows.map((row) => [String(row._id), row]));
  const openCommentsByScene = new Map(openCommentRows.map((row) => [String(row._id), row.count]));
  const videoCountByScene = new Map(videoCountRows.map((row) => [String(row._id), row.count]));

  return Promise.all(
    scenes.map(async (scene) => {
      const sceneKey = String(scene._id);
      const latestVideo = latestVideoByScene.get(sceneKey) ?? null;
      const openComments = openCommentsByScene.get(sceneKey) ?? 0;
      const videoCount = videoCountByScene.get(sceneKey) ?? 0;
      const sceneShots = shotsByScene.get(sceneKey) ?? [];
      const sceneStage = scene.stage ?? "storyboard";
      const orderedShots = [...sceneShots].sort(
        (left, right) =>
          (typeof left.startFrame === "number" ? left.startFrame : 0) -
            (typeof right.startFrame === "number" ? right.startFrame : 0) ||
          compareNumericText(left.shotNumber, right.shotNumber)
      );
      const [latestVideoUrl, latestThumbnailUrl, shotsOut] = await Promise.all([
        latestVideo?.s3Key ? maybeGetSignedObjectUrl(latestVideo.s3Key) : Promise.resolve(null),
        latestVideo?.thumbnailKey ? maybeGetSignedObjectUrl(latestVideo.thumbnailKey) : Promise.resolve(null),
        Promise.all(
          orderedShots.map(async (shot) => {
            const clip = latestClipByShotStage.get(`${String(shot._id)}:${sceneStage}`) ?? null;
            return {
              id: String(shot._id),
              shotNumber: shot.shotNumber,
              shotType: shot.shotType,
              description: shot.description,
              startFrame: typeof shot.startFrame === "number" ? shot.startFrame : null,
              clipUrl: clip ? await maybeGetSignedObjectUrl(clip.s3Key) : null,
              clipVersion: clip?.versionNumber ?? null
            };
          })
        )
      ]);

      return {
        id: String(scene._id),
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        description: scene.description,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        status: scene.status,
        latestVideo: latestVideo
          ? {
              id: String(latestVideo.videoId),
              versionNumber: latestVideo.versionNumber,
              stage: latestVideo.stage,
              status: latestVideo.status,
              createdAt: latestVideo.createdAt?.toISOString(),
              url: latestVideoUrl,
              mimeType: latestVideo.mimeType ?? null,
              duration: latestVideo.duration ?? null,
              thumbnailUrl: latestThumbnailUrl
            }
          : null,
        openComments,
        videoCount,
        shots: shotsOut,
        updatedAt: scene.updatedAt?.toISOString()
      };
    })
  );
}

export type ProjectPlaylistItem = {
  sceneId: string;
  sceneNumber: string;
  label: string;
  url: string;
  mimeType: string | null;
};

// Playlist secuencial del proyecto: en orden de escena, los clips de cada plano
// en la etapa activa de la escena; si una escena no tiene clips por plano, cae a
// su último video de escena. Misma regla que el playthrough del detalle, pero
// devolviendo sólo lo reproducible (para el mini-player del listado /projects).
export async function getProjectPlaylist(projectId: string): Promise<ProjectPlaylistItem[]> {
  await connectDb();

  const scenes = await Scene.find({ projectId }).lean();
  scenes.sort((left, right) => compareNumericText(left.sceneNumber, right.sceneNumber));
  const sceneIds = scenes.map((scene) => scene._id);
  const shots = await Shot.find({ projectId, sceneId: { $in: sceneIds } }).lean();
  const shotsByScene = new Map<string, typeof shots>();
  for (const shot of shots) {
    const key = String(shot.sceneId);
    shotsByScene.set(key, [...(shotsByScene.get(key) ?? []), shot]);
  }

  const shotClips = await VideoVersion.find({
    projectId,
    scope: "shot",
    status: "ready_for_review",
    shotId: { $in: shots.map((shot) => shot._id) }
  })
    .select("shotId stage versionNumber s3Key mimeType")
    .lean();
  const latestClipByShotStage = new Map<
    string,
    { versionNumber: number; s3Key: string; mimeType: string | null }
  >();
  for (const clip of shotClips) {
    if (!clip.s3Key) continue;
    const key = `${String(clip.shotId)}:${clip.stage}`;
    const current = latestClipByShotStage.get(key);
    if (!current || clip.versionNumber > current.versionNumber) {
      latestClipByShotStage.set(key, {
        versionNumber: clip.versionNumber,
        s3Key: clip.s3Key,
        mimeType: clip.mimeType ?? null
      });
    }
  }

  // Último video por escena para el fallback, en un solo agregado (antes era un
  // findOne por escena dentro del loop → N+1 secuencial).
  const fallbackRows = await VideoVersion.aggregate<{
    _id: unknown;
    s3Key?: string;
    mimeType?: string | null;
  }>([
    { $match: { sceneId: { $in: sceneIds } } },
    { $sort: { sceneId: 1, createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$sceneId",
        s3Key: { $first: "$s3Key" },
        mimeType: { $first: "$mimeType" }
      }
    }
  ]);
  const fallbackByScene = new Map<string, { s3Key: string; mimeType: string | null }>();
  for (const row of fallbackRows) {
    if (row.s3Key) fallbackByScene.set(String(row._id), { s3Key: row.s3Key, mimeType: row.mimeType ?? null });
  }

  // Se arman las entradas (con su s3Key) en orden y luego se firman todas las
  // URLs en paralelo, en vez de secuencialmente por escena.
  type PendingItem = Omit<ProjectPlaylistItem, "url"> & { s3Key: string };
  const pending: PendingItem[] = [];
  for (const scene of scenes) {
    const sceneStage = scene.stage ?? "storyboard";
    const sceneShots = [...(shotsByScene.get(String(scene._id)) ?? [])].sort(
      (left, right) =>
        (typeof left.startFrame === "number" ? left.startFrame : 0) -
          (typeof right.startFrame === "number" ? right.startFrame : 0) ||
        compareNumericText(left.shotNumber, right.shotNumber)
    );
    const clippedShots = sceneShots
      .map((shot) => ({
        shot,
        clip: latestClipByShotStage.get(`${String(shot._id)}:${sceneStage}`) ?? null
      }))
      .filter((entry) => entry.clip);

    if (clippedShots.length > 0) {
      for (const entry of clippedShots) {
        pending.push({
          sceneId: String(scene._id),
          sceneNumber: scene.sceneNumber,
          label: entry.shot.shotNumber,
          s3Key: entry.clip!.s3Key,
          mimeType: entry.clip!.mimeType
        });
      }
      continue;
    }

    const fallback = fallbackByScene.get(String(scene._id));
    if (fallback) {
      pending.push({
        sceneId: String(scene._id),
        sceneNumber: scene.sceneNumber,
        label: "",
        s3Key: fallback.s3Key,
        mimeType: fallback.mimeType
      });
    }
  }

  const urls = await Promise.all(pending.map((entry) => maybeGetSignedObjectUrl(entry.s3Key)));
  const items: ProjectPlaylistItem[] = [];
  pending.forEach((entry, index) => {
    const url = urls[index];
    if (url) {
      items.push({
        sceneId: entry.sceneId,
        sceneNumber: entry.sceneNumber,
        label: entry.label,
        url,
        mimeType: entry.mimeType
      });
    }
  });

  return items;
}
