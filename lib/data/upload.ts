import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { User } from "@/models/User";
import { roleHasPermission } from "@/lib/auth/permissions";

export async function getUploadOptions(userId: string) {
  await connectDb();

  const [user, memberships] = await Promise.all([
    User.findById(userId).select("accountRole").lean(),
    ProjectMembership.find({ userId }).lean()
  ]);
  const isGlobalAdmin = user?.accountRole === "admin";

  const projects = isGlobalAdmin
    ? await Project.find({}).sort({ title: 1 }).lean()
    : await Project.find({
        _id: {
          $in: memberships
            .filter((membership) => roleHasPermission(membership.role, "video:upload"))
            .map((membership) => membership.projectId)
        }
      })
        .sort({ title: 1 })
        .lean();

  const projectIds = projects.map((project) => project._id);
  const scenes = await Scene.find({ projectId: { $in: projectIds } })
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
