import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { Comment } from "@/models/Comment";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { VideoVersion } from "@/models/VideoVersion";

async function maybeGetSignedVideoUrl(s3Key: string) {
  if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET) {
    return null;
  }

  try {
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: getUploadBucket(),
        Key: s3Key
      }),
      { expiresIn: 60 * 30 }
    );
  } catch {
    return null;
  }
}

export async function getProjectEditorData(projectId: string) {
  await connectDb();

  const project = await Project.findById(projectId).lean();

  if (!project) {
    return null;
  }

  const scenes = await Scene.find({ projectId }).sort({ sortOrder: 1, sceneNumber: 1 }).lean();
  const sceneIds = scenes.map((scene) => scene._id);

  const [videos, shots, openCommentCounts] = await Promise.all([
    VideoVersion.find({ projectId, sceneId: { $in: sceneIds } })
      .sort({ isFavorite: -1, versionNumber: -1, createdAt: -1 })
      .lean(),
    Shot.find({ projectId, sceneId: { $in: sceneIds } }).sort({ shotNumber: 1 }).lean(),
    Comment.aggregate<{ _id: string; count: number }>([
      { $match: { projectId: project._id, status: { $in: ["open", "in_progress"] } } },
      { $group: { _id: "$sceneId", count: { $sum: 1 } } }
    ])
  ]);

  const commentsByScene = new Map(openCommentCounts.map((item) => [String(item._id), item.count]));
  const shotsByScene = new Map<string, typeof shots>();
  const videosByScene = new Map<string, typeof videos>();

  for (const shot of shots) {
    const key = String(shot.sceneId);
    shotsByScene.set(key, [...(shotsByScene.get(key) ?? []), shot]);
  }

  for (const video of videos) {
    const key = String(video.sceneId);
    videosByScene.set(key, [...(videosByScene.get(key) ?? []), video]);
  }

  const editorScenes = await Promise.all(
    scenes.map(async (scene, index) => {
      const sceneVideos = videosByScene.get(String(scene._id)) ?? [];
      const selectedVideo =
        sceneVideos.find((video) => String(video._id) === String(scene.currentVideoVersionId)) ??
        sceneVideos.find((video) => video.isFavorite) ??
        sceneVideos[0] ??
        null;

      const serializedVideos = await Promise.all(
        sceneVideos.map(async (video) => ({
          id: String(video._id),
          versionNumber: video.versionNumber,
          stage: video.stage,
          status: video.status,
          fileName: video.fileName,
          duration: video.duration,
          fps: video.fps,
          frameCount: video.frameCount,
          resolution: video.resolution,
          isFavorite: video.isFavorite,
          createdAt: video.createdAt?.toISOString(),
          url: video.status === "ready_for_review" ? await maybeGetSignedVideoUrl(video.s3Key) : null
        }))
      );

      const sceneShots = shotsByScene.get(String(scene._id)) ?? [];

      return {
        id: String(scene._id),
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        description: scene.description,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        status: scene.status,
        sortOrder: scene.sortOrder ?? index,
        openComments: commentsByScene.get(String(scene._id)) ?? 0,
        script: {
          sceneText: scene.description,
          shots: sceneShots.map((shot) => ({
            id: String(shot._id),
            shotNumber: shot.shotNumber,
            shotType: shot.shotType,
            description: shot.description,
            action: shot.action,
            camera: shot.camera,
            sound: shot.sound,
            requiredElements: shot.requiredElements,
            productionNotes: shot.productionNotes
          }))
        },
        selectedVideoId: selectedVideo ? String(selectedVideo._id) : null,
        versions: serializedVideos
      };
    })
  );

  return {
    project: {
      id: String(project._id),
      slug: project.slug,
      title: project.title,
      description: project.description,
      fpsDefault: project.fpsDefault
    },
    scenes: editorScenes
  };
}
