import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import { getDictionary } from "@/lib/i18n/server";
import { optionLabel, translate } from "@/lib/i18n/messages";

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, dictionary] = await Promise.all([getProjectsForUser(user.id), getDictionary()]);
  const t = (path: string) => translate(dictionary, path);

  return (
    <div className="grid gap-6 p-5 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">{t("project.projectsTitle")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("project.projectsSubtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30 transition hover:border-red-900/70"
            href={`/projects/${project.id}`}
            key={project.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">{project.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                  {project.description}
                </p>
              </div>
              <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs font-medium text-slate-300">
                {optionLabel(dictionary, "userRoles", project.role)}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">{t("project.officialFps")}</dt>
                <dd className="font-medium text-slate-100">{project.fpsDefault}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Slug</dt>
                <dd className="font-medium text-slate-100">{project.slug}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-8 text-center">
          <p className="font-medium text-slate-50">{t("project.emptyAssigned")}</p>
          <p className="mt-2 text-sm text-slate-400">{t("project.askAdmin")}</p>
        </div>
      ) : null}
    </div>
  );
}
