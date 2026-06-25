import { connectDb } from "@/lib/db/mongoose";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { AudioVersion } from "@/models/AudioVersion";
import { Comment } from "@/models/Comment";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { StoryboardFrame } from "@/models/StoryboardFrame";
import { VideoVersion } from "@/models/VideoVersion";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

function compareNumericText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function reelName(parts: Array<string | number | null | undefined>) {
  const compact = parts
    .filter((part) => part !== null && part !== undefined && String(part).trim().length > 0)
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return compact.slice(0, 8).padEnd(Math.min(Math.max(compact.length, 1), 8), "0");
}

async function signedMediaRef(s3Key: string | null | undefined) {
  if (!s3Key) {
    return {
      downloadUrl: null,
      urlExpiresAt: null
    };
  }

  const downloadUrl = await maybeGetSignedObjectUrl(s3Key);

  return {
    downloadUrl,
    urlExpiresAt: downloadUrl
      ? new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
      : null
  };
}

export async function getProjectNleManifest(projectId: string) {
  await connectDb();

  const project = await Project.findById(projectId).lean();

  if (!project) {
    return null;
  }

  const scenes = await Scene.find({ projectId }).sort({ sortOrder: 1, sceneNumber: 1 }).lean();
  scenes.sort((left, right) => {
    const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    return sortDelta || compareNumericText(left.sceneNumber, right.sceneNumber);
  });

  const sceneIds = scenes.map((scene) => scene._id);

  const [shots, videos, storyboardFrames, audioVersions, comments] = await Promise.all([
    Shot.find({ projectId, sceneId: { $in: sceneIds } }).sort({ sceneNumber: 1, shotNumber: 1 }).lean(),
    VideoVersion.find({
      projectId,
      sceneId: { $in: sceneIds },
      status: { $in: ["ready_for_review", "approved"] }
    })
      .sort({ sceneId: 1, shotId: 1, stage: 1, versionNumber: -1 })
      .lean(),
    StoryboardFrame.find({ projectId, sceneId: { $in: sceneIds }, status: "ready" })
      .sort({ shotId: 1, versionNumber: -1 })
      .lean(),
    AudioVersion.find({ projectId, sceneId: { $in: sceneIds }, status: "ready" })
      .sort({ sceneId: 1, stem: 1, versionNumber: -1 })
      .lean(),
    Comment.find({ projectId, sceneId: { $in: sceneIds }, status: { $ne: "archived" } })
      .sort({ sceneId: 1, frame: 1 })
      .lean()
  ]);

  shots.sort(
    (left, right) =>
      compareNumericText(left.sceneNumber, right.sceneNumber) ||
      compareNumericText(left.shotNumber, right.shotNumber)
  );

  const shotsBySceneId = new Map<string, typeof shots>();
  for (const shot of shots) {
    const key = String(shot.sceneId);
    shotsBySceneId.set(key, [...(shotsBySceneId.get(key) ?? []), shot]);
  }

  const videosByShotId = new Map<string, typeof videos>();
  const sceneScopedVideosBySceneId = new Map<string, typeof videos>();
  for (const video of videos) {
    if (video.shotId) {
      const key = String(video.shotId);
      videosByShotId.set(key, [...(videosByShotId.get(key) ?? []), video]);
    } else {
      const key = String(video.sceneId);
      sceneScopedVideosBySceneId.set(key, [...(sceneScopedVideosBySceneId.get(key) ?? []), video]);
    }
  }

  const storyboardByShotId = new Map<string, typeof storyboardFrames>();
  for (const frame of storyboardFrames) {
    const key = String(frame.shotId);
    storyboardByShotId.set(key, [...(storyboardByShotId.get(key) ?? []), frame]);
  }

  const audioBySceneId = new Map<string, typeof audioVersions>();
  for (const audio of audioVersions) {
    const key = String(audio.sceneId);
    audioBySceneId.set(key, [...(audioBySceneId.get(key) ?? []), audio]);
  }

  const commentsByVideoId = new Map<string, typeof comments>();
  const commentsBySceneId = new Map<string, typeof comments>();
  for (const comment of comments) {
    const videoKey = String(comment.videoVersionId);
    const sceneKey = String(comment.sceneId);
    commentsByVideoId.set(videoKey, [...(commentsByVideoId.get(videoKey) ?? []), comment]);
    commentsBySceneId.set(sceneKey, [...(commentsBySceneId.get(sceneKey) ?? []), comment]);
  }

  return {
    generatedAt: new Date().toISOString(),
    mediaPolicy: {
      delivery: "signed_url",
      signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
      commitMediaToGit: false
    },
    project: {
      id: String(project._id),
      slug: project.slug,
      title: project.title,
      description: project.description,
      fpsDefault: project.fpsDefault,
      resolution: "1920x1080"
    },
    scenes: await Promise.all(
      scenes.map(async (scene) => {
        const sceneId = String(scene._id);
        const sceneShots = shotsBySceneId.get(sceneId) ?? [];
        const sceneVideos = sceneScopedVideosBySceneId.get(sceneId) ?? [];

        return {
          id: sceneId,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          description: scene.description,
          literaryHeading: scene.literaryHeading ?? "",
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          status: scene.status,
          fps: project.fpsDefault,
          sceneScopedVideos: await Promise.all(
            sceneVideos.map(async (video) => ({
              id: String(video._id),
              scope: video.scope,
              stage: video.stage,
              versionNumber: video.versionNumber,
              fileName: video.fileName,
              originalFileName: video.fileName,
              displayName: `${scene.sceneNumber} ${video.stage} v${video.versionNumber}`,
              reelName: reelName(["S", scene.sceneNumber, video.stage, video.versionNumber]),
              mimeType: video.mimeType,
              duration: video.duration,
              fps: video.fps,
              frameCount: video.frameCount,
              resolution: video.resolution,
              fileSizeMb: video.fileSizeMb,
              etag: video.etag ?? null,
              isFavorite: video.isFavorite,
              status: video.status,
              sourceTimecodeStart: "00:00:00:00",
              createdAt: video.createdAt?.toISOString() ?? null,
              ...(await signedMediaRef(video.s3Key)),
              markers: (commentsByVideoId.get(String(video._id)) ?? []).map((comment) => ({
                id: String(comment._id),
                sourceCommentId: String(comment._id),
                frame: comment.frame,
                timeSeconds: comment.timeSeconds,
                timecode: comment.timecode,
                label: comment.priority,
                note: comment.text,
                status: comment.status,
                priority: comment.priority
              }))
            }))
          ),
          audioVersions: await Promise.all(
            (audioBySceneId.get(sceneId) ?? []).map(async (audio) => ({
              id: String(audio._id),
              stem: audio.stem,
              scope: audio.scope,
              versionNumber: audio.versionNumber,
              fileName: audio.fileName,
              originalFileName: audio.fileName,
              displayName: `${scene.sceneNumber} ${audio.stem} v${audio.versionNumber}`,
              reelName: reelName(["S", scene.sceneNumber, audio.stem, audio.versionNumber]),
              mimeType: audio.mimeType,
              duration: audio.duration,
              fileSizeMb: audio.fileSizeMb,
              etag: audio.etag ?? null,
              status: audio.status,
              createdAt: audio.createdAt?.toISOString() ?? null,
              ...(await signedMediaRef(audio.s3Key))
            }))
          ),
          shots: await Promise.all(
            sceneShots.map(async (shot) => {
              const shotId = String(shot._id);

              return {
                id: shotId,
                shotNumber: shot.shotNumber,
                title: shot.title ?? "",
                shotType: shot.shotType,
                status: shot.status ?? "animatic",
                description: shot.description,
                action: shot.action,
                camera: shot.camera,
                sound: shot.sound,
                requiredElements: shot.requiredElements,
                productionNotes: shot.productionNotes,
                startFrame: shot.startFrame ?? null,
                endFrame: shot.endFrame ?? null,
                durationFrames: shot.durationFrames ?? null,
                videoVersions: await Promise.all(
                  (videosByShotId.get(shotId) ?? []).map(async (video) => ({
                    id: String(video._id),
                    scope: video.scope,
                    stage: video.stage,
                    versionNumber: video.versionNumber,
                    fileName: video.fileName,
                    originalFileName: video.fileName,
                    displayName: `${scene.sceneNumber}/${shot.shotNumber} ${video.stage} v${video.versionNumber}`,
                    reelName: reelName(["S", scene.sceneNumber, "P", shot.shotNumber, "V", video.versionNumber]),
                    mimeType: video.mimeType,
                    duration: video.duration,
                    fps: video.fps,
                    frameCount: video.frameCount,
                    resolution: video.resolution,
                    fileSizeMb: video.fileSizeMb,
                    etag: video.etag ?? null,
                    isFavorite: video.isFavorite,
                    status: video.status,
                    sourceTimecodeStart: "00:00:00:00",
                    createdAt: video.createdAt?.toISOString() ?? null,
                    ...(await signedMediaRef(video.s3Key)),
                    markers: (commentsByVideoId.get(String(video._id)) ?? []).map((comment) => ({
                      id: String(comment._id),
                      sourceCommentId: String(comment._id),
                      frame: comment.frame,
                      timeSeconds: comment.timeSeconds,
                      timecode: comment.timecode,
                      label: comment.priority,
                      note: comment.text,
                      status: comment.status,
                      priority: comment.priority
                    }))
                  }))
                ),
                storyboardFrames: await Promise.all(
                  (storyboardByShotId.get(shotId) ?? []).map(async (frame) => ({
                    id: String(frame._id),
                    versionNumber: frame.versionNumber,
                    fileName: frame.fileName,
                    originalFileName: frame.fileName,
                    displayName: `${scene.sceneNumber}/${shot.shotNumber} storyboard v${frame.versionNumber}`,
                    reelName: reelName(["SB", scene.sceneNumber, shot.shotNumber, frame.versionNumber]),
                    mimeType: frame.mimeType,
                    fileSizeMb: frame.fileSizeMb,
                    width: frame.width ?? null,
                    height: frame.height ?? null,
                    etag: frame.etag ?? null,
                    status: frame.status,
                    createdAt: frame.createdAt?.toISOString() ?? null,
                    ...(await signedMediaRef(frame.s3Key)),
                    thumbnail: frame.thumbnailKey ? await signedMediaRef(frame.thumbnailKey) : null
                  }))
                )
              };
            })
          ),
          markers: (commentsBySceneId.get(sceneId) ?? []).map((comment) => ({
            id: String(comment._id),
            sourceCommentId: String(comment._id),
            videoVersionId: String(comment.videoVersionId),
            shotId: comment.shotId ? String(comment.shotId) : null,
            frame: comment.frame,
            timeSeconds: comment.timeSeconds,
            timecode: comment.timecode,
            label: comment.priority,
            note: comment.text,
            status: comment.status,
            priority: comment.priority
          }))
        };
      })
    )
  };
}

