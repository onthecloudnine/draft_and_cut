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

type PlaylistItem = {
  sceneId: string;
  videoVersionId: string;
  sceneNumber: string;
  title: string;
  versionNumber: number;
  url: string;
  mimeType: string | null;
  thumbnailUrl: string | null;
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

  const playlist = useMemo<PlaylistItem[]>(
    () =>
      scenes
        .filter((scene) => scene.latestVideo?.url && scene.latestVideo.id)
        .map((scene) => ({
          sceneId: scene.id,
          videoVersionId: scene.latestVideo!.id!,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          versionNumber: scene.latestVideo!.versionNumber,
          url: scene.latestVideo!.url!,
          mimeType: scene.latestVideo!.mimeType ?? null,
          thumbnailUrl: scene.latestVideo!.thumbnailUrl ?? null
        })),
    [scenes]
  );

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
              href={`/join/${project.slug}`}
              target="_blank"
            >
              {t("project.accessPage")}
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-slate-200 hover:bg-neutral-800"
              href={`/upload?projectId=${project.id}`}
            >
              {t("app.uploadVersion")}
            </Link>
          </div>
        </div>
      </section>

      {playlist.length > 0 ? (
        <section className="border-b border-neutral-800 bg-neutral-950 px-5 py-5 sm:px-7">
          <ScenesPlaylistPlayer items={playlist} />
        </section>
      ) : null}

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
              {scene.latestVideo?.thumbnailUrl ? (
                <Link
                  className="block aspect-video w-full overflow-hidden bg-black"
                  href={`/scenes/${scene.id}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={scene.title}
                    className="h-full w-full object-cover transition hover:opacity-90"
                    loading="lazy"
                    src={scene.latestVideo.thumbnailUrl}
                  />
                </Link>
              ) : null}
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

function ScenesPlaylistPlayer({ items }: { items: PlaylistItem[] }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backfilledRef = useRef<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});

  const baseCurrent = items[index] ?? items[0];
  const current = baseCurrent
    ? {
        ...baseCurrent,
        thumbnailUrl: thumbnailOverrides[baseCurrent.videoVersionId] ?? baseCurrent.thumbnailUrl
      }
    : baseCurrent;

  useEffect(() => {
    if (index >= items.length) {
      setIndex(0);
    }
  }, [items.length, index]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;
    video.load();
    if (autoPlay) {
      video.play().catch(() => {
        /* autoplay may be blocked until user interacts */
      });
    }
  }, [current?.url, autoPlay]);

  useEffect(() => {
    if (!baseCurrent) return;
    if (baseCurrent.thumbnailUrl) return;
    if (backfilledRef.current.has(baseCurrent.videoVersionId)) return;
    backfilledRef.current.add(baseCurrent.videoVersionId);

    let cancelled = false;
    void (async () => {
      try {
        const blob = await captureFrameFromUrl(baseCurrent.url);
        if (cancelled || !blob) return;

        const initResponse = await fetch(`/api/videos/${baseCurrent.videoVersionId}/thumbnail`, {
          method: "POST"
        });
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

        await fetch(`/api/videos/${baseCurrent.videoVersionId}/thumbnail`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnailKey: init.thumbnailKey })
        });
        if (cancelled) return;

        const previewUrl = URL.createObjectURL(blob);
        setThumbnailOverrides((current) => ({
          ...current,
          [baseCurrent.videoVersionId]: previewUrl
        }));
      } catch {
        /* best-effort — leave card without thumb */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseCurrent?.videoVersionId, baseCurrent?.url, baseCurrent?.thumbnailUrl]);

  useEffect(() => {
    return () => {
      Object.values(thumbnailOverrides).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!current) return null;

  const handleEnded = () => {
    setAutoPlay(true);
    setIndex((value) => (value + 1) % items.length);
  };

  const handleSelect = (nextIndex: number) => {
    setAutoPlay(true);
    setIndex(nextIndex);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-red-300">{t("project.playlistTitle")}</p>
            <p className="mt-1 truncate text-sm text-slate-200">
              {t("project.playlistNow", {
                sceneNumber: current.sceneNumber,
                versionNumber: current.versionNumber
              })}
              {current.title ? <span className="text-slate-500"> · {current.title}</span> : null}
            </p>
          </div>
          <p className="shrink-0 text-xs text-slate-500">
            {index + 1} / {items.length}
          </p>
        </div>
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          controls
          playsInline
          preload="metadata"
          poster={current.thumbnailUrl ?? undefined}
          onEnded={handleEnded}
          key={current.sceneId}
        >
          <source src={current.url} type={current.mimeType ?? undefined} />
        </video>
      </div>

      <aside className="rounded-lg border border-neutral-800 bg-neutral-900">
        <p className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
          {t("project.playlistQueue", { count: items.length })}
        </p>
        <ul className="max-h-72 overflow-y-auto py-1 lg:max-h-[calc(100%-2.5rem)]">
          {items.map((item, itemIndex) => {
            const isActive = itemIndex === index;
            return (
              <li key={item.sceneId}>
                <button
                  type="button"
                  onClick={() => handleSelect(itemIndex)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition ${
                    isActive
                      ? "bg-red-900/40 text-slate-50"
                      : "text-slate-300 hover:bg-neutral-800"
                  }`}
                >
                  <span className="w-10 shrink-0 font-semibold text-slate-100">
                    {item.sceneNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-slate-500">v{item.versionNumber}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
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
