import { requireUser } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import { getDictionary } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import { ProjectCards } from "./project-cards";

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, dictionary] = await Promise.all([getProjectsForUser(user.id), getDictionary()]);
  const t = (path: string) => translate(dictionary, path);

  return (
    <div className="grid gap-6 p-5 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-fg-strong">{t("project.projectsTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("project.projectsSubtitle")}</p>
      </div>

      <ProjectCards projects={projects} />

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="font-medium text-fg-strong">{t("project.emptyAssigned")}</p>
          <p className="mt-2 text-sm text-muted">{t("project.askAdmin")}</p>
        </div>
      ) : null}
    </div>
  );
}
