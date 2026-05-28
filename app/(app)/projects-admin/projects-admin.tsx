"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
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

type SourceMode = "script" | "manual";

export function ProjectsAdmin({ initialProjects }: { initialProjects: ProjectAdminItem[] }) {
  const { t } = useI18n();
  const [projects, setProjects] = useState(initialProjects);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("manual");
  const [sceneCount, setSceneCount] = useState(0);
  const [scriptText, setScriptText] = useState("");
  const [scriptFileName, setScriptFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(form.id);

  function resetForm() {
    setForm(emptyForm);
    setError("");
    setStatus("");
    setSourceMode("manual");
    setSceneCount(0);
    setScriptText("");
    setScriptFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleScriptFile(file: File) {
    setError("");
    try {
      const text = await file.text();
      setScriptText(text);
      setScriptFileName(file.name);
    } catch {
      setScriptText("");
      setScriptFileName("");
      setError(t("projectsAdmin.scriptReadError"));
    }
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
      const body: Record<string, unknown> = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        fpsDefault: Number(form.fpsDefault)
      };
      if (!isEditing) {
        if (sourceMode === "script" && scriptText.trim()) {
          body.scriptText = scriptText;
        } else if (sourceMode === "manual" && sceneCount > 0) {
          body.sceneCount = sceneCount;
        }
      }
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("projectsAdmin.saveError"));
      }

      const payload = (await response.json()) as {
        project: { id?: string; _id?: string };
        createdSceneCount?: number;
      };
      const projectId = payload.project.id ?? payload.project._id ?? form.id;
      if (!projectId) {
        throw new Error(t("projectsAdmin.saveError"));
      }
      const createdSceneCount = payload.createdSceneCount ?? 0;

      const updatedItem: ProjectAdminItem = {
        id: projectId,
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        fpsDefault: Number(form.fpsDefault),
        sceneCount: isEditing
          ? projects.find((item) => item.id === form.id)?.sceneCount ?? 0
          : createdSceneCount
      };

      setProjects((current) => {
        if (isEditing) {
          return current.map((item) => (item.id === form.id ? { ...item, ...updatedItem } : item));
        }
        return [...current, updatedItem].sort((left, right) =>
          left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
        );
      });

      if (isEditing) {
        setStatus(t("projectsAdmin.updated"));
      } else if (createdSceneCount > 0) {
        setStatus(t("projectsAdmin.createdWithScenes", { count: createdSceneCount }));
      } else {
        setStatus(t("projectsAdmin.created"));
      }
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
      <section className="border-b border-line pb-5">
        <h1 className="text-2xl font-semibold text-fg-strong">{t("projectsAdmin.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("projectsAdmin.subtitle")}</p>
      </section>

      <section className="grid gap-5 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          className="grid content-start gap-4 rounded-lg border border-line bg-surface p-5 shadow-lg shadow-black/30"
          onSubmit={saveProject}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-fg-strong">
                {isEditing ? t("projectsAdmin.editProject") : t("projectsAdmin.createProject")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("projectsAdmin.formHint")}</p>
            </div>
            {isEditing ? (
              <button
                className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-muted-strong hover:bg-elevated"
                onClick={resetForm}
                type="button"
              >
                {t("projectsAdmin.new")}
              </button>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("projectsAdmin.slug")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="ej: uky-lola"
              required
              value={form.slug}
            />
            <span className="text-xs text-muted">{t("projectsAdmin.slugHint")}</span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("projectsAdmin.titleLabel")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              value={form.title}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("projectsAdmin.description")}
            <textarea
              className="min-h-24 rounded-md border border-line-strong bg-background px-3 py-2 text-fg"
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              value={form.description}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("projectsAdmin.fpsDefault")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
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

          {!isEditing ? (
            <div className="grid gap-3 rounded-md border border-line bg-elevated p-3">
              <p className="text-sm font-medium text-muted-strong">{t("projectsAdmin.sourceLabel")}</p>
              <div className="grid gap-2">
                <label className="flex items-start gap-2 text-sm text-muted-strong">
                  <input
                    checked={sourceMode === "script"}
                    className="mt-0.5"
                    name="source-mode"
                    onChange={() => setSourceMode("script")}
                    type="radio"
                  />
                  <span>
                    <span className="block font-medium">{t("projectsAdmin.sourceScript")}</span>
                    <span className="block text-xs text-muted">
                      {t("projectsAdmin.sourceScriptHint")}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-muted-strong">
                  <input
                    checked={sourceMode === "manual"}
                    className="mt-0.5"
                    name="source-mode"
                    onChange={() => setSourceMode("manual")}
                    type="radio"
                  />
                  <span>
                    <span className="block font-medium">{t("projectsAdmin.sourceManual")}</span>
                    <span className="block text-xs text-muted">
                      {t("projectsAdmin.sourceManualHint")}
                    </span>
                  </span>
                </label>
              </div>

              {sourceMode === "script" ? (
                <label className="grid gap-2 text-sm font-medium text-muted-strong">
                  {t("projectsAdmin.scriptFile")}
                  <input
                    accept=".txt,.md,text/plain,text/markdown"
                    className="block w-full text-sm text-muted-strong file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:text-fg hover:file:bg-line-strong"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleScriptFile(file);
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                  <span className="text-xs text-muted">{t("projectsAdmin.scriptFileHint")}</span>
                  {scriptFileName ? (
                    <span className="text-xs text-success-fg">
                      {scriptFileName} ·{" "}
                      {t("projectsAdmin.scriptFileLoaded", {
                        size: (new Blob([scriptText]).size / 1024).toFixed(1)
                      })}
                    </span>
                  ) : null}
                </label>
              ) : (
                <label className="grid gap-2 text-sm font-medium text-muted-strong">
                  {t("projectsAdmin.sceneCount")}
                  <input
                    className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
                    max={500}
                    min={0}
                    onChange={(event) => setSceneCount(Number(event.target.value))}
                    type="number"
                    value={sceneCount}
                  />
                </label>
              )}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-fg">{error}</p>
          ) : null}
          {status ? (
            <p className="rounded-md border border-success bg-success-soft p-3 text-sm text-success-fg">
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

        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-lg shadow-black/30">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-fg-strong">{t("projectsAdmin.list")}</h2>
            <p className="mt-1 text-sm text-muted">
              {t("projectsAdmin.listCount", { count: projects.length })}
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-elevated text-xs uppercase text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.titleLabel")}</th>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.slug")}</th>
                <th className="px-5 py-3 font-semibold">FPS</th>
                <th className="px-5 py-3 font-semibold">{t("projectsAdmin.scenes")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("projectsAdmin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-5 py-3 text-fg">{project.title}</td>
                  <td className="px-5 py-3 text-muted">{project.slug}</td>
                  <td className="px-5 py-3 text-muted">{project.fpsDefault}</td>
                  <td className="px-5 py-3 text-muted">{project.sceneCount}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-fg hover:bg-elevated"
                        href={`/projects/${project.id}`}
                      >
                        {t("projectsAdmin.open")}
                      </Link>
                      <button
                        className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-fg hover:bg-elevated"
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
            <div className="p-8 text-center text-sm text-muted">{t("projectsAdmin.empty")}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
