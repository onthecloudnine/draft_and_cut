import { requireUser } from "@/lib/auth/session";
import { assertGlobalAdmin } from "@/lib/auth/admin";
import { getAllProjectsForAdmin } from "@/lib/data/projects";
import { ProjectsAdmin } from "./projects-admin";

export default async function ProjectsAdminPage() {
  const user = await requireUser();
  await assertGlobalAdmin(user.id);
  const projects = await getAllProjectsForAdmin();

  return <ProjectsAdmin initialProjects={projects} />;
}
