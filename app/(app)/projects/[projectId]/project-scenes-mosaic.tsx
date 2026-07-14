"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { backfillVideoThumbnail } from "@/lib/uploads/thumbnails";

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
    startFrame: number | null;
    clipUrl: string | null;
    clipVersion: number | null;
  }>;
};

type PlaylistItem = {
  sceneId: string;
  sceneNumber: string;
  label: string;
  url: string;
  mimeType: string | null;
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

  // Playlist global: todos los planos (su clip) de todas las escenas, en orden.
  // Si una escena no tiene clips por plano, cae a su video de escena.
  const playlist = useMemo<PlaylistItem[]>(() => {
    const items: PlaylistItem[] = [];
    for (const scene of scenes) {
      const shotClips = scene.shots.filter((shot) => shot.clipUrl);
      if (shotClips.length > 0) {
        for (const shot of shotClips) {
          items.push({
            sceneId: scene.id,
            sceneNumber: scene.sceneNumber,
            label: `${t("scene.shotShort")} ${shot.shotNumber}`,
            url: shot.clipUrl as string,
            mimeType: null
          });
        }
      } else if (scene.latestVideo?.url) {
        items.push({
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          label: `${t("project.scene")} ${scene.sceneNumber}`,
          url: scene.latestVideo.url,
          mimeType: scene.latestVideo.mimeType ?? null
        });
      }
    }
    return items;
  }, [scenes, t]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    () => playlist[0]?.sceneId ?? scenes[0]?.id ?? ""
  );
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

  const currentItem = playlist[currentIndex] ?? null;
  const playableUrl = currentItem?.url ?? null;
  // currentVideo (nivel escena) se sigue usando para las miniaturas del strip.
  const currentVideo = selectedScene?.latestVideo ?? null;
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
      const previewUrl = await backfillVideoThumbnail(videoId, videoUrl);
      if (cancelled || !previewUrl) return;
      setThumbnailOverrides((current) => ({ ...current, [videoId]: previewUrl }));
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
    setSelectedSceneId(sceneId);
    const idx = playlist.findIndex((item) => item.sceneId === sceneId);
    if (idx >= 0) {
      setAutoPlay(Boolean(opts.play));
      setCurrentIndex(idx);
    }
  };

  const handleEnded = () => {
    const next = currentIndex + 1;
    if (next < playlist.length) {
      setAutoPlay(true);
      setCurrentIndex(next);
      setSelectedSceneId(playlist[next].sceneId);
    }
  };

  const playAll = () => {
    if (playlist.length === 0) return;
    setAutoPlay(true);
    setSelectedSceneId(playlist[0].sceneId);
    setCurrentIndex(0);
  };

  const totalScenes = scenes.length;
  const scenesWithVideo = useMemo(() => scenes.filter((scene) => scene.latestVideo?.url).length, [scenes]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-fg">
      <section className="shrink-0 border-b border-line bg-background/80 px-5 py-3 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">{project.slug}</p>
            <h1 className="mt-0.5 truncate text-lg font-semibold text-fg-strong">{project.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {playlist.length > 0 ? (
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-red-600 px-2.5 font-semibold text-white hover:bg-red-500"
                onClick={playAll}
                type="button"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {t("project.playAll")}
              </button>
            ) : null}
            <StatPill label={t("project.scenes")} value={totalScenes} />
            <StatPill label={t("project.videos")} value={scenesWithVideo} />
            <Link
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2.5 font-medium text-fg hover:bg-elevated"
              href={`/projects/${project.id}/board`}
            >
              {t("board.openBoard")}
            </Link>
            <span className="rounded-md border border-line bg-surface px-2.5 py-1 text-muted">
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
                key={currentIndex}
                className="max-h-full max-w-full rounded-md bg-black shadow-2xl shadow-black/60"
                controls
                onEnded={handleEnded}
                playsInline
                poster={playablePoster}
                preload="metadata"
              >
                <source src={playableUrl} type={currentItem?.mimeType ?? undefined} />
              </video>
            ) : (
              <EmptyPlayer
                title={t("scene.noPreviewTitle")}
                subtitle={selectedScene ? t("scene.noPreviewBody") : t("project.emptyScenes")}
              />
            )}
          </div>
          {selectedScene ? (
            <div className="shrink-0 border-t border-line bg-background/80 px-4 py-2 text-xs text-muted sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-fg">
                  {t("project.scene")} {selectedScene.sceneNumber}
                </span>
                {selectedScene.title ? <span className="truncate text-muted">{selectedScene.title}</span> : null}
                {currentItem ? (
                  <span className="text-muted">
                    · {currentItem.label} · {currentIndex + 1}/{playlist.length}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-line bg-surface lg:w-[340px] lg:border-l xl:w-[380px]">
          {selectedScene ? (
            <SceneInfoPanel
              key={selectedScene.id}
              optionLabel={optionLabel}
              scene={selectedScene}
              t={t}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
              {t("project.emptyScenes")}
            </div>
          )}
        </aside>
      </section>

      <section className="shrink-0 border-t border-line bg-background">
        <div className="flex items-center justify-between px-5 pb-1 pt-3 sm:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("project.timelineTitle")}
          </p>
          <p className="text-[11px] text-muted">
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
                      : "border-line hover:border-line-strong"
                  ].join(" ")}
                  onClick={() => handleSelect(scene.id, { play: true })}
                  type="button"
                >
                  <div className="relative aspect-video w-full bg-surface">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={scene.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        src={thumb}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted">
                        {t("project.noVideos")}
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-fg">
                      {scene.sceneNumber}
                    </span>
                    {scene.latestVideo ? (
                      <span className="absolute right-1.5 top-1.5 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        v{scene.latestVideo.versionNumber}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-2 py-1.5">
                    <p className="truncate text-[12px] font-medium text-fg">{scene.title || "—"}</p>
                    <p className="truncate text-[10px] text-muted">
                      {optionLabel("sceneStatuses", scene.status)}
                      {scene.openComments > 0 ? ` · ${scene.openComments} ${t("project.open")}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
          {scenes.length === 0 ? (
            <li className="flex h-24 w-full items-center justify-center text-sm text-muted">
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
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-muted">
      <span className="font-semibold text-fg">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function EmptyPlayer({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex max-w-md flex-col items-center justify-center rounded-md border border-dashed border-line bg-background/60 px-8 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-muted">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path d="M5 5h11l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
          <path d="M10 11l5 3-5 3z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-1 text-xs text-muted">{subtitle}</p>
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
      <div className="shrink-0 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("project.scene")} {scene.sceneNumber}
            </p>
            <h2 className="mt-1 text-base font-semibold text-fg-strong">{scene.title || "—"}</h2>
          </div>
          <span className="shrink-0 rounded-md border border-line bg-background px-2 py-1 text-[11px] font-medium text-muted-strong">
            {optionLabel("sceneStatuses", scene.status)}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
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
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-strong">{scene.description}</p>
        ) : null}

        {scene.latestVideo ? (
          <div className="mt-4 rounded-md border border-line bg-background p-3 text-xs">
            <p className="font-semibold uppercase tracking-wider text-muted">
              {t("scene.loadedVideo")}
            </p>
            <p className="mt-1 text-fg">
              {t("project.latestVideo", {
                stage: optionLabel("productionStages", scene.latestVideo.stage),
                versionNumber: scene.latestVideo.versionNumber,
                status: scene.latestVideo.status
              })}
            </p>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("scene.shots")}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {scene.shots.map((shot) => (
              <li key={shot.id}>
                <Link
                  className="block rounded-md border border-line bg-background px-2.5 py-2 text-xs text-muted-strong transition hover:border-line-strong hover:bg-surface"
                  href={`/scenes/${scene.id}?shotId=${shot.id}`}
                >
                  <span className="font-semibold text-fg">Shot {shot.shotNumber}</span>
                  {shot.shotType ? <span className="text-muted"> · {shot.shotType}</span> : null}
                </Link>
              </li>
            ))}
            {scene.shots.length === 0 ? (
              <li className="rounded-md bg-background px-2.5 py-2 text-xs text-muted">
                {t("project.emptyShots")}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-3 sm:p-4">
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
    <div className="rounded-md border border-line bg-background px-2 py-2">
      <p className="text-sm font-semibold text-fg">{value}</p>
      <p className="mt-0.5 text-muted">{label}</p>
    </div>
  );
}
