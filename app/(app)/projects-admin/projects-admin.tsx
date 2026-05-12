"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/client";

type ProjectAdminItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  fpsDefault: number;
  sceneCount: number;
  createdAt?: string;
  updatedAt?: string;
};

type FormState = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  fpsDefault: number;
};

const emptyForm: FormState = {
  slug: "",
  title: "",
  description: "",
  fpsDefault: 24
};

export function ProjectsAdmin({ initialProjects }: { initialProjects: ProjectAdminItem[] }) {
  const { t } = useI18n();
  const [projects, setProjects] = useState(initialProjects);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(form.id);

  function resetForm() {
    setForm(emptyForm);
    setError("");
    setStatus("");
  }

  function editProject(project: ProjectAdminItem) {
    setForm({
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      fpsDefault: project.fpsDefault
    });
    setError("");
    setStatus("");
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSaving(true);

    try {
      const url = isEditing ? `/api/projects/${form.id}` : "/api/projects";
      const method = isEditing ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title.trim(),
          description: form.description.trim(),
          fpsDefault: Number(form.fpsDefault)
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("projectsAdmin.saveError"));
      }

      const payload = (await response.json()) as { project: { id: string } };
      const projectId = payload.project.id ?? form.id;

      const updatedItem: ProjectAdminItem = {
        id: projectId!,
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        fpsDefault: Number(form.fpsDefault),
        sceneCount: isEditing ? projects.find((item) => item.id === form.id)?.sceneCount ?? 0 : 0
      };

      setProjects((current) => {
        if (isEditing) {
          return current.map((item) => (item.id === form.id ? { ...item, ...updatedItem } : item));
        }
        return [...current, updatedItem].sort((left, right) =>
          left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
        );
      });

      setStatus(isEditing ? t("projectsAdmin.updated") : t("projectsAdmin.created"));
      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("projectsAdmin.unexpectedSaveError")
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7">
      <section className="border-b border-neutral-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-50">{t("projectsAdmin.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{t("projectsAdmin.subtitle")}</p>
      </section>

      <section className="grid gap-5 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          className="grid content-start gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30"
          onSubmit={saveProject}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-50">
                {isEditing ? t("projectsAdmin.editProject") : t("projectsAdmin.createProject")}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{t("projectsAdmin.formHint")}</p>
            </div>
            {isEditing ? (
              <button
                className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-neutral-800"
                onClick={resetForm}
                type="button"
              >
                {t("projectsAdmin.new")}
              </button>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("projectsAdmin.slug")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="ej: uky-lola"
              required
              value={form.slug}
            />
            <span className="text-xs text-slate-500">{t("projectsAdmin.slugHint")}</span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("projectsAdmin.titleLabel")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              value={form.title}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("projectsAdmin.description")}
            <textarea
              className="min-h-24 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100"
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              value={form.description}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("projectsAdmin.fpsDefault")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              max={240}
              min={1}
              onChange={(event) =>
                setForm((current) => ({ ...current, fpsDefault: Number(event.target.value) }))
              }
              required
              type="number"
              value={form.fpsDefault}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>
          ) : null}
          {status ? (
            <p className="rounded-md border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm text-emerald-200">
              {status}
            </p>
          ) : null}

          <button
            className="h-11 rounded-md bg-red-900 px-5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving
              ? t("projectsAdmin.saving")
              : isEditing
                ? t("projectsAdmin.saveChanges")
                : t("projectsAdmin.create")}
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/30">
          <div className="border-b border-neutral-800 px-5 py-4">
            <h2 className="font-semibold text-slate-50">{t("projectsAdmin.list")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("projectsAdmin.listCount", { count: projects.length })}
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.titleLabel")}</th>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.slug")}</th>
                <th className="px-5 py-3 font-semibold">FPS</th>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.scenes")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("projectsAdmin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-5 py-3 text-slate-100">{project.title}</td>
                  <td className="px-5 py-3 text-slate-400">{project.slug}</td>
                  <td className="px-5 py-3 text-slate-400">{project.fpsDefault}</td>
                  <td className="px-5 py-3 text-slate-400">{project.sceneCount}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-neutral-800"
                        href={`/projects/${project.id}`}
                      >
                        {t("projectsAdmin.open")}
                      </Link>
                      <button
                        className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-neutral-800"
                        onClick={() => editProject(project)}
                        type="button"
                      >
                        {t("projectsAdmin.edit")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t("projectsAdmin.empty")}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
