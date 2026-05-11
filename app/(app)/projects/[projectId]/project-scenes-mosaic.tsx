"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";

type SceneCard = {
  id: string;
  sceneNumber: string;
  title: string;
  description: string;
  location: string;
  timeOfDay: string;
  status: string;
  latestVideo: {
    versionNumber: number;
    stage: string;
    status: string;
  } | null;
  openComments: number;
  videoCount: number;
  shots: Array<{
    id: string;
    shotNumber: string;
    shotType: string;
    description: string;
  }>;
};

type ProjectScenesMosaicProps = {
  project: {
    id: string;
    slug: string;
    title: string;
    description: string;
  };
  scenes: SceneCard[];
  userRole: string;
};

export function ProjectScenesMosaic({ project, scenes, userRole }: ProjectScenesMosaicProps) {
  const { optionLabel, t } = useI18n();

  return (
    <div className="h-full overflow-y-auto">
      <section className="border-b border-neutral-800 bg-black px-5 py-5 sm:px-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-red-300">{project.slug}</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-50">{project.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{project.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-slate-200 hover:bg-neutral-800"
              href={`/upload?projectId=${project.id}`}
            >
              {t("app.uploadVersion")}
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-5 sm:px-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">{t("project.scenes")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("project.availableScenes", { count: scenes.length, role: optionLabel("userRoles", userRole) })}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {scenes.map((scene) => (
            <article
              className="grid min-h-80 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/30"
              key={scene.id}
            >
              <Link className="block border-b border-neutral-800 bg-black p-4 text-white hover:bg-neutral-900" href={`/scenes/${scene.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-slate-400">{t("project.scene")}</p>
                    <h3 className="mt-1 text-3xl font-semibold leading-none">{scene.sceneNumber}</h3>
                  </div>
                  <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-200">
                    {optionLabel("sceneStatuses", scene.status)}
                  </span>
                </div>
                <p className="mt-5 line-clamp-2 text-sm font-medium leading-5">{scene.title}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {scene.location || t("project.noLocation")} · {scene.timeOfDay || t("project.noTime")}
                </p>
              </Link>

              <div className="grid gap-4 p-4">
                <p className="line-clamp-3 text-sm leading-6 text-slate-400">{scene.description}</p>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-black px-2 py-2">
                    <p className="font-semibold text-slate-100">{scene.shots.length}</p>
                    <p className="mt-1 text-slate-500">{t("project.shots")}</p>
                  </div>
                  <div className="rounded-md bg-black px-2 py-2">
                    <p className="font-semibold text-slate-100">{scene.videoCount}</p>
                    <p className="mt-1 text-slate-500">{t("project.videos")}</p>
                  </div>
                  <div className="rounded-md bg-black px-2 py-2">
                    <p className="font-semibold text-slate-100">{scene.openComments}</p>
                    <p className="mt-1 text-slate-500">{t("project.open")}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">{t("scene.shots")}</p>
                  <div className="mt-2 grid max-h-28 gap-1.5 overflow-y-auto pr-1">
                    {scene.shots.map((shot) => (
                      <Link
                        className="rounded-md border border-neutral-800 bg-black/60 px-2 py-1.5 text-xs hover:border-red-900/70 hover:bg-neutral-900"
                        href={`/scenes/${scene.id}?shotId=${shot.id}`}
                        key={shot.id}
                      >
                        <span className="font-semibold text-slate-100">Shot {shot.shotNumber}</span>
                        {shot.shotType ? <span className="text-slate-500"> · {shot.shotType}</span> : null}
                      </Link>
                    ))}
                    {scene.shots.length === 0 ? (
                      <p className="rounded-md bg-black px-2 py-2 text-xs text-slate-500">
                        {t("project.emptyShots")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-neutral-800 pt-3 text-xs text-slate-500">
                  {scene.latestVideo ? (
                    <p>
                      {t("project.latestVideo", {
                        stage: optionLabel("productionStages", scene.latestVideo.stage),
                        versionNumber: scene.latestVideo.versionNumber,
                        status: scene.latestVideo.status
                      })}
                    </p>
                  ) : (
                    <p>{t("project.noVideos")}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {scenes.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-slate-400">
            {t("project.emptyScenes")}
          </div>
        ) : null}
      </section>
    </div>
  );
}
