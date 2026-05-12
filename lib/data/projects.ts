import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { VideoVersion } from "@/models/VideoVersion";
import { Comment } from "@/models/Comment";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";

function compareNumericText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export async function getProjectsForUser(userId: string) {
  await connectDb();

  const memberships = await ProjectMembership.find({ userId }).lean();
  const projectIds = memberships.map((membership) => membership.projectId);
  const projects = await Project.find({ _id: { $in: projectIds } }).sort({ title: 1 }).lean();

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
      role: membership?.role ?? "read_only"
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

  return Promise.all(
    scenes.map(async (scene) => {
      const [latestVideo, openComments, videoCount] = await Promise.all([
        VideoVersion.findOne({ sceneId: scene._id })
          .sort({ createdAt: -1 })
          .select("versionNumber stage status createdAt s3Key mimeType duration thumbnailKey")
          .lean(),
        Comment.countDocuments({ sceneId: scene._id, status: { $in: ["open", "in_progress"] } }),
        VideoVersion.countDocuments({ sceneId: scene._id })
      ]);
      const sceneShots = shotsByScene.get(String(scene._id)) ?? [];
      const [latestVideoUrl, latestThumbnailUrl] = await Promise.all([
        latestVideo?.s3Key ? maybeGetSignedObjectUrl(latestVideo.s3Key) : Promise.resolve(null),
        latestVideo?.thumbnailKey ? maybeGetSignedObjectUrl(latestVideo.thumbnailKey) : Promise.resolve(null)
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
              id: String(latestVideo._id),
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
        shots: sceneShots.map((shot) => ({
          id: String(shot._id),
          shotNumber: shot.shotNumber,
          shotType: shot.shotType,
          description: shot.description
        })),
        updatedAt: scene.updatedAt?.toISOString()
      };
    })
  );
}
