import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await getProjectsForUser(user.id);

  return (
    <div className="grid gap-6 p-5 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Proyectos</h1>
        <p className="mt-2 text-sm text-slate-400">
          Producciones disponibles para revision, versionado y seguimiento.
        </p>
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
                {project.role}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">FPS oficial</dt>
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
          <p className="font-medium text-slate-50">No tienes proyectos asignados.</p>
          <p className="mt-2 text-sm text-slate-400">
            Pide a un administrador que te agregue a una produccion.
          </p>
        </div>
      ) : null}
    </div>
  );
}
