"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
    id?: string;
    versionNumber: number;
    stage: string;
    status: string;
    url?: string | null;
    mimeType?: string | null;
    duration?: number | null;
    thumbnailUrl?: string | null;
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
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => {
    const firstWithVideo = scenes.find((scene) => scene.latestVideo?.url);
    return firstWithVideo?.id ?? scenes[0]?.id ?? "";
  });
  const [autoPlay, setAutoPlay] = useState(false);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});
  const thumbnailOverridesRef = useRef(thumbnailOverrides);
  thumbnailOverridesRef.current = thumbnailOverrides;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backfilledRef = useRef<Set<string>>(new Set());
  const timelineRef = useRef<HTMLUListElement | null>(null);
  const activeThumbRef = useRef<HTMLLIElement | null>(null);

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0] ?? null,
    [scenes, selectedSceneId]
  );

  const currentVideo = selectedScene?.latestVideo ?? null;
  const playableUrl = currentVideo?.url ?? null;
  const playablePoster = useMemo(() => {
    if (!currentVideo?.id) return currentVideo?.thumbnailUrl ?? undefined;
    return thumbnailOverrides[currentVideo.id] ?? currentVideo.thumbnailUrl ?? undefined;
  }, [currentVideo?.id, currentVideo?.thumbnailUrl, thumbnailOverrides]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
    if (autoPlay && playableUrl) {
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    }
  }, [playableUrl, autoPlay]);

  useEffect(() => {
    if (!activeThumbRef.current) return;
    activeThumbRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedSceneId]);

  useEffect(() => {
    if (!currentVideo?.id || !currentVideo.url) return;
    if (currentVideo.thumbnailUrl) return;
    if (backfilledRef.current.has(currentVideo.id)) return;
    backfilledRef.current.add(currentVideo.id);

    const videoId = currentVideo.id;
    const videoUrl = currentVideo.url;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await captureFrameFromUrl(videoUrl);
        if (cancelled || !blob) return;

        const initResponse = await fetch(`/api/videos/${videoId}/thumbnail`, { method: "POST" });
        if (!initResponse.ok) return;
        const init = (await initResponse.json()) as {
          thumbnailKey: string;
          uploadUrl: string;
          uploadHeaders?: Record<string, string>;
        };

        const putResponse = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg", ...(init.uploadHeaders ?? {}) },
          body: blob
        });
        if (!putResponse.ok || cancelled) return;

        await fetch(`/api/videos/${videoId}/thumbnail`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnailKey: init.thumbnailKey })
        });
        if (cancelled) return;

        const previewUrl = URL.createObjectURL(blob);
        setThumbnailOverrides((current) => ({ ...current, [videoId]: previewUrl }));
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentVideo?.id, currentVideo?.url, currentVideo?.thumbnailUrl]);

  useEffect(() => {
    return () => {
      Object.values(thumbnailOverridesRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSelect = (sceneId: string, opts: { play?: boolean } = {}) => {
    setAutoPlay(Boolean(opts.play));
    setSelectedSceneId(sceneId);
  };

  const handleEnded = () => {
    if (!selectedScene) return;
    const idx = scenes.findIndex((scene) => scene.id === selectedScene.id);
    for (let i = idx + 1; i < scenes.length; i += 1) {
      if (scenes[i].latestVideo?.url) {
        handleSelect(scenes[i].id, { play: true });
        return;
      }
    }
  };

  const totalScenes = scenes.length;
  const scenesWithVideo = useMemo(() => scenes.filter((scene) => scene.latestVideo?.url).length, [scenes]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <section className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">{project.slug}</p>
            <h1 className="mt-0.5 truncate text-lg font-semibold text-zinc-50">{project.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatPill label={t("project.scenes")} value={totalScenes} />
            <StatPill label={t("project.videos")} value={scenesWithVideo} />
            <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-400">
              {optionLabel("userRoles", userRole)}
            </span>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col bg-black">
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
            {playableUrl ? (
              <video
                ref={videoRef}
                key={selectedScene?.id}
                className="max-h-full max-w-full rounded-md bg-black shadow-2xl shadow-black/60"
                controls
                onEnded={handleEnded}
                playsInline
                poster={playablePoster}
                preload="metadata"
              >
                <source src={playableUrl} type={currentVideo?.mimeType ?? undefined} />
              </video>
            ) : (
              <EmptyPlayer
                title={t("scene.noPreviewTitle")}
                subtitle={selectedScene ? t("scene.noPreviewBody") : t("project.emptyScenes")}
              />
            )}
          </div>
          {selectedScene ? (
            <div className="shrink-0 border-t border-zinc-900 bg-zinc-950/80 px-4 py-2 text-xs text-zinc-400 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-zinc-200">
                  {t("project.scene")} {selectedScene.sceneNumber}
                </span>
                {selectedScene.title ? <span className="truncate text-zinc-400">{selectedScene.title}</span> : null}
                {currentVideo ? (
                  <span className="text-zinc-500">
                    · {optionLabel("productionStages", currentVideo.stage)} v{currentVideo.versionNumber}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-zinc-800 bg-zinc-900 lg:w-[340px] lg:border-l xl:w-[380px]">
          {selectedScene ? (
            <SceneInfoPanel
              key={selectedScene.id}
              optionLabel={optionLabel}
              scene={selectedScene}
              t={t}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
              {t("project.emptyScenes")}
            </div>
          )}
        </aside>
      </section>

      <section className="shrink-0 border-t border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between px-5 pb-1 pt-3 sm:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("project.timelineTitle")}
          </p>
          <p className="text-[11px] text-zinc-600">
            {t("project.timelineCount", { count: totalScenes })}
          </p>
        </div>
        <ul
          ref={timelineRef}
          className="flex gap-2.5 overflow-x-auto overflow-y-hidden px-5 pb-4 pt-2 sm:px-7"
        >
          {scenes.map((scene) => {
            const isActive = scene.id === selectedSceneId;
            const overrideThumb = scene.latestVideo?.id
              ? thumbnailOverrides[scene.latestVideo.id]
              : undefined;
            const thumb = overrideThumb ?? scene.latestVideo?.thumbnailUrl ?? null;
            return (
              <li
                key={scene.id}
                ref={isActive ? activeThumbRef : null}
                className="shrink-0"
              >
                <button
                  className={[
                    "group relative flex w-44 flex-col overflow-hidden rounded-md border text-left transition",
                    isActive
                      ? "border-red-500/80 ring-2 ring-red-500/40"
                      : "border-zinc-800 hover:border-zinc-600"
                  ].join(" ")}
                  onClick={() => handleSelect(scene.id, { play: true })}
                  type="button"
                >
                  <div className="relative aspect-video w-full bg-zinc-900">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={scene.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        src={thumb}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-zinc-600">
                        {t("project.noVideos")}
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-100">
                      {scene.sceneNumber}
                    </span>
                    {scene.latestVideo ? (
                      <span className="absolute right-1.5 top-1.5 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        v{scene.latestVideo.versionNumber}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 bg-zinc-900 px-2 py-1.5">
                    <p className="truncate text-[12px] font-medium text-zinc-100">{scene.title || "—"}</p>
                    <p className="truncate text-[10px] text-zinc-500">
                      {optionLabel("sceneStatuses", scene.status)}
                      {scene.openComments > 0 ? ` · ${scene.openComments} ${t("project.open")}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
          {scenes.length === 0 ? (
            <li className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
              {t("project.emptyScenes")}
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-400">
      <span className="font-semibold text-zinc-100">{value}</span>
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}

function EmptyPlayer({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex max-w-md flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-950/60 px-8 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path d="M5 5h11l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
          <path d="M10 11l5 3-5 3z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
    </div>
  );
}

function SceneInfoPanel({
  optionLabel,
  scene,
  t
}: {
  optionLabel: (group: string, value: string) => string;
  scene: SceneCard;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("project.scene")} {scene.sceneNumber}
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">{scene.title || "—"}</h2>
          </div>
          <span className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-300">
            {optionLabel("sceneStatuses", scene.status)}
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {scene.location || t("project.noLocation")} · {scene.timeOfDay || t("project.noTime")}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <Metric label={t("project.shots")} value={scene.shots.length} />
          <Metric label={t("project.videos")} value={scene.videoCount} />
          <Metric label={t("project.open")} value={scene.openComments} />
        </div>

        {scene.description ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-300">{scene.description}</p>
        ) : null}

        {scene.latestVideo ? (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs">
            <p className="font-semibold uppercase tracking-wider text-zinc-500">
              {t("scene.loadedVideo")}
            </p>
            <p className="mt-1 text-zinc-200">
              {t("project.latestVideo", {
                stage: optionLabel("productionStages", scene.latestVideo.stage),
                versionNumber: scene.latestVideo.versionNumber,
                status: scene.latestVideo.status
              })}
            </p>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("scene.shots")}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {scene.shots.map((shot) => (
              <li key={shot.id}>
                <Link
                  className="block rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
                  href={`/scenes/${scene.id}?shotId=${shot.id}`}
                >
                  <span className="font-semibold text-zinc-100">Shot {shot.shotNumber}</span>
                  {shot.shotType ? <span className="text-zinc-500"> · {shot.shotType}</span> : null}
                </Link>
              </li>
            ))}
            {scene.shots.length === 0 ? (
              <li className="rounded-md bg-zinc-950 px-2.5 py-2 text-xs text-zinc-500">
                {t("project.emptyShots")}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800 p-3 sm:p-4">
        <Link
          className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          href={`/scenes/${scene.id}`}
        >
          {t("project.openScene")}
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2">
      <p className="text-sm font-semibold text-zinc-100">{value}</p>
      <p className="mt-0.5 text-zinc-500">{label}</p>
    </div>
  );
}

async function captureFrameFromUrl(url: string): Promise<Blob | null> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("metadata"));
    });
    const seekTo = Math.min(
      Math.max(video.duration - 0.2, 0.1),
      Math.max(3.0, video.duration * 0.33)
    );
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek"));
      video.currentTime = seekTo;
    });
    const maxWidth = 640;
    const ratio = video.videoWidth > 0 ? Math.min(1, maxWidth / video.videoWidth) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8)
    );
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
