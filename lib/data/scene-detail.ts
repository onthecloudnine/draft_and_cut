import { connectDb } from "@/lib/db/mongoose";
import { maybeGetSignedObjectUrl } from "@/lib/s3/signed-url";
import { AssetTag } from "@/models/AssetTag";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { SceneAssetTag } from "@/models/SceneAssetTag";
import { SceneAttachment } from "@/models/SceneAttachment";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Shot } from "@/models/Shot";
import { User } from "@/models/User";
import { VideoVersion } from "@/models/VideoVersion";
import type { SceneSoundOption } from "@/types/domain";

function compareNumericText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export async function getSceneDetailData(sceneId: string) {
  await connectDb();

  const scene = await Scene.findById(sceneId).lean();

  if (!scene) {
    return null;
  }

  const projectScenes = await Scene.find({ projectId: scene.projectId })
    .select("sceneNumber title")
    .lean();
  projectScenes.sort((left, right) => compareNumericText(left.sceneNumber, right.sceneNumber));
  const currentIndex = projectScenes.findIndex(
    (item) => String(item._id) === String(scene._id)
  );
  const previousScene = currentIndex > 0 ? projectScenes[currentIndex - 1] : null;
  const nextScene =
    currentIndex >= 0 && currentIndex < projectScenes.length - 1
      ? projectScenes[currentIndex + 1]
      : null;

  const [
    project,
    shots,
    videos,
    attachments,
    memberships,
    resourceAssignments,
    sceneAssetTags,
    activeUsers
  ] = await Promise.all([
    Project.findById(scene.projectId).select("fpsDefault").lean(),
    Shot.find({ sceneId }).sort({ shotNumber: 1 }).lean(),
    VideoVersion.find({ sceneId }).sort({ isFavorite: -1, createdAt: -1 }).lean(),
    SceneAttachment.find({ sceneId, status: "ready" }).sort({ attachmentDate: -1, createdAt: -1 }).lean(),
    ProjectMembership.find({ projectId: scene.projectId }).lean(),
    SceneResourceAssignment.find({ sceneId }).sort({ createdAt: 1 }).lean(),
    SceneAssetTag.find({ sceneId }).sort({ createdAt: 1 }).lean(),
    User.find({ isActive: true }).select("name email accountRole isActive").sort({ name: 1, email: 1 }).lean()
  ]);
  const assetTags = await AssetTag.find({ _id: { $in: sceneAssetTags.map((assignment) => assignment.tagId) } })
    .select("name category")
    .lean();
  const assetTagById = new Map(assetTags.map((tag) => [String(tag._id), tag]));
  shots.sort((left, right) => compareNumericText(left.shotNumber, right.shotNumber));
  const userIds = Array.from(
    new Set([
      ...attachments.map((attachment) => String(attachment.uploadedBy)),
      ...memberships.map((membership) => String(membership.userId)),
      ...resourceAssignments.map((assignment) => String(assignment.userId))
    ])
  );
  const users = await User.find({ _id: { $in: userIds } }).select("name email isActive").lean();
  const userById = new Map([...users, ...activeUsers].map((user) => [String(user._id), user]));
  const membershipRoleByUserId = new Map(memberships.map((membership) => [String(membership.userId), membership.role]));

  return {
    scene: {
      id: String(scene._id),
      projectId: String(scene.projectId),
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      description: scene.description,
      literaryHeading: scene.literaryHeading ?? "",
      literaryScript: scene.literaryScript ?? "",
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      soundOptions: (scene.soundOptions?.length ? scene.soundOptions : ["none"]) as SceneSoundOption[],
      status: scene.status,
      fpsDefault: project?.fpsDefault ?? 24
    },
    previousScene: previousScene
      ? {
          id: String(previousScene._id),
          sceneNumber: previousScene.sceneNumber,
          title: previousScene.title
        }
      : null,
    nextScene: nextScene
      ? {
          id: String(nextScene._id),
          sceneNumber: nextScene.sceneNumber,
          title: nextScene.title
        }
      : null,
    shots: shots.map((shot) => ({
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
    })),
    videos: await Promise.all(
      videos.map(async (video) => ({
        id: String(video._id),
        shotId: video.shotId ? String(video.shotId) : null,
        scope: video.scope,
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
        url: video.status === "ready_for_review" ? await maybeGetSignedObjectUrl(video.s3Key) : null
      }))
    ),
    attachments: await Promise.all(
      attachments.map(async (attachment) => {
        const uploader = userById.get(String(attachment.uploadedBy));

        return {
          id: String(attachment._id),
          title: attachment.title,
          description: attachment.description,
          attachmentDate: attachment.attachmentDate.toISOString(),
          fileName: attachment.fileName,
          fileSizeMb: attachment.fileSizeMb,
          mimeType: attachment.mimeType,
          uploadedByName: uploader?.name ?? uploader?.email ?? "Usuario",
          createdAt: attachment.createdAt?.toISOString(),
          url: await maybeGetSignedObjectUrl(attachment.s3Key)
        };
      })
    ),
    projectMembers: activeUsers
      .map((member) => ({
        id: String(member._id),
        name: member.name,
        email: member.email,
        role: membershipRoleByUserId.get(String(member._id)) ?? member.accountRole ?? "user"
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    humanResources: resourceAssignments
      .map((assignment) => {
        const member = userById.get(String(assignment.userId));

        if (!member) {
          return null;
        }

        return {
          id: String(assignment._id),
          userId: String(assignment.userId),
          name: member.name,
          email: member.email,
          role: membershipRoleByUserId.get(String(assignment.userId)) ?? "read_only",
          assignedAt: assignment.createdAt?.toISOString()
        };
      })
      .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource)),
    assetTags: sceneAssetTags
      .map((assignment) => {
        const tag = assetTagById.get(String(assignment.tagId));

        if (!tag) {
          return null;
        }

        return {
          id: String(assignment._id),
          tagId: String(assignment.tagId),
          category: assignment.category,
          name: tag.name
        };
      })
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
  };
}
