import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { roleHasPermission } from "@/lib/auth/permissions";

export async function getUploadOptions(userId: string) {
  await connectDb();

  const memberships = await ProjectMembership.find({ userId }).lean();
  const uploadProjectIds = memberships
    .filter((membership) => roleHasPermission(membership.role, "video:upload"))
    .map((membership) => membership.projectId);

  const projects = await Project.find({ _id: { $in: uploadProjectIds } }).sort({ title: 1 }).lean();
  const scenes = await Scene.find({ projectId: { $in: uploadProjectIds } })
    .sort({ sceneNumber: 1 })
    .lean();
  return {
    projects: projects.map((project) => ({
      id: String(project._id),
      title: project.title,
      fpsDefault: project.fpsDefault
    })),
    scenes: scenes.map((scene) => ({
      id: String(scene._id),
      projectId: String(scene.projectId),
      sceneNumber: scene.sceneNumber,
      title: scene.title
    }))
  };
}
