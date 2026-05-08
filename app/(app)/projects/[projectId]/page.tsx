import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getProjectSceneSummaries } from "@/lib/data/projects";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { ProjectScenesMosaic } from "./project-scenes-mosaic";

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const role = await assertProjectPermission(user.id, projectId, "project:read");
  await connectDb();

  const [project, scenes] = await Promise.all([
    Project.findById(projectId).lean(),
    getProjectSceneSummaries(projectId)
  ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectScenesMosaic
      project={{
        id: String(project._id),
        slug: project.slug,
        title: project.title,
        description: project.description
      }}
      scenes={scenes}
      userRole={role}
    />
  );
}
