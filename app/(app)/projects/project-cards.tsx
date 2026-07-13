"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

type ProjectCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  fpsDefault: number;
  role: string;
};

type PlaylistItem = {
  sceneId: string;
  sceneNumber: string;
  label: string;
  url: string;
  mimeType: string | null;
};

// Duración fija con la que se muestra cada imagen en la secuencia (los clips de
// plano pueden ser imágenes, no sólo video).
const IMAGE_SECONDS = 3;

export function ProjectCards({ projects }: { projects: ProjectCard[] }) {
  const { optionLabel, t } = useI18n();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lg shadow-black/30 transition hover:border-line-strong"
          key={project.id}
        >
          <ProjectMiniPlayer projectId={project.id} t={t} />
          <Link
            className="group flex flex-1 flex-col gap-3 p-4 transition hover:bg-elevated/40"
            href={`/projects/${project.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-fg-strong">{project.title}</h2>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{project.description}</p>
              </div>
              <span className="shrink-0 rounded border border-line bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted-strong">
                {optionLabel("userRoles", project.role)}
              </span>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 text-[11px] text-muted">
              <div className="flex min-w-0 items-center gap-3">
                <span>
                  <span className="text-muted-strong">{project.fpsDefault}</span> {t("project.officialFps")}
                </span>
                <span className="text-line-strong">·</span>
                <span className="truncate font-mono text-muted-strong">{project.slug}</span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-danger-fg">
                {t("project.enterProject")}
                <svg
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

type PlayerStatus = "idle" | "loading" | "ready" | "empty" | "error";

function ProjectMiniPlayer({
  projectId,
  t
}: {
  projectId: string;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedRef = useRef(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const current = items[index] ?? null;
  const isImage = Boolean(current?.mimeType?.startsWith("image/"));
  const atEnd = items.length > 0 && index >= items.length - 1;

  const advance = useCallback(() => {
    setIndex((cur) => {
      if (cur + 1 < items.length) return cur + 1;
      setPlaying(false);
      return cur;
    });
  }, [items.length]);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setStatus("loading");
    try {
      const res = await fetch(`/api/projects/${projectId}/playlist`);
      if (!res.ok) throw new Error("request");
      const data = (await res.json()) as { items: PlaylistItem[] };
      if (!data.items || data.items.length === 0) {
        setStatus("empty");
        return;
      }
      setItems(data.items);
      setIndex(0);
      setPlaying(true);
      setStatus("ready");
    } catch {
      loadedRef.current = false;
      setStatus("error");
    }
  }, [projectId]);

  // Al cambiar de clip se recarga y arranca si la secuencia está activa.
  useEffect(() => {
    if (status !== "ready" || isImage) return;
    const video = videoRef.current;
    if (!video) return;
    video.load();
    if (playingRef.current) {
      video.play().catch(() => {
        /* el navegador puede bloquear el autoplay */
      });
    }
  }, [status, index, isImage]);

  // Play/pausa del clip actual según el estado de la secuencia.
  useEffect(() => {
    if (status !== "ready" || isImage) return;
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.play().catch(() => {
        /* el navegador puede bloquear el autoplay */
      });
    } else {
      video.pause();
    }
  }, [status, isImage, playing]);

  // Reproducción de imágenes: avanza tras una duración fija.
  useEffect(() => {
    if (status !== "ready" || !isImage || !playing) return;
    const id = window.setTimeout(advance, IMAGE_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [status, isImage, playing, index, advance]);

  const go = (delta: number) => {
    setIndex((cur) => Math.min(items.length - 1, Math.max(0, cur + delta)));
    setPlaying(true);
  };

  const togglePlay = () => {
    if (atEnd && !playing) {
      replay();
      return;
    }
    setPlaying((p) => !p);
  };

  const replay = () => {
    setIndex(0);
    setPlaying(true);
  };

  return (
    <div className="flex flex-col">
      <div className="relative aspect-video w-full bg-black">
        {status === "ready" && current ? (
          isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={current.label} className="h-full w-full object-contain" src={current.url} />
          ) : (
            <video
              ref={videoRef}
              key={index}
              className="h-full w-full cursor-pointer bg-black"
              onClick={togglePlay}
              onEnded={advance}
              playsInline
              preload="metadata"
            >
              <source src={current.url} type={current.mimeType ?? undefined} />
            </video>
          )
        ) : (
          <button
            aria-label={t("project.playProject")}
            className="group flex h-full w-full items-center justify-center gap-2 text-muted transition hover:bg-white/5 disabled:cursor-default"
            disabled={status === "loading" || status === "empty"}
            onClick={() => void load()}
            type="button"
          >
            {status === "loading" ? (
              <>
                <Spinner />
                <span className="text-[12px]">{t("project.playlistLoading")}</span>
              </>
            ) : status === "empty" ? (
              <span className="text-[12px]">{t("project.playlistEmpty")}</span>
            ) : status === "error" ? (
              <span className="text-[12px] text-danger-fg">{t("project.playlistError")}</span>
            ) : (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white transition group-hover:bg-red-500">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="text-[12px] font-medium">{t("project.playProject")}</span>
              </>
            )}
          </button>
        )}

        {status === "ready" && !isImage && !playing && !atEnd ? (
          <button
            aria-label={t("project.play")}
            className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35"
            onClick={togglePlay}
            type="button"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        ) : null}

        {atEnd && !playing && status === "ready" ? (
          <button
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white"
            onClick={replay}
            type="button"
          >
            <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className="text-[12px] font-medium">{t("project.playAgain")}</span>
          </button>
        ) : null}
      </div>

      {status === "ready" ? (
        <div className="flex items-center gap-2 border-t border-line bg-background px-2.5 py-1.5 text-[11px]">
          <button
            aria-label={playing ? t("project.pause") : t("project.play")}
            className="rounded p-0.5 text-muted hover:bg-elevated hover:text-fg"
            onClick={togglePlay}
            type="button"
          >
            {playing ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            aria-label={t("project.prevClip")}
            className="rounded p-0.5 text-muted hover:bg-elevated hover:text-fg disabled:opacity-40"
            disabled={index === 0}
            onClick={() => go(-1)}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span className="min-w-0 flex-1 truncate text-muted">
            <span className="font-medium text-fg">
              {t("project.scene")} {current?.sceneNumber}
            </span>
            {current?.label ? <span className="text-muted"> · {t("scene.shotShort")} {current.label}</span> : null}
          </span>
          <span className="shrink-0 tabular-nums text-muted">
            {index + 1}/{items.length}
          </span>
          <button
            aria-label={t("project.nextClip")}
            className="rounded p-0.5 text-muted hover:bg-elevated hover:text-fg disabled:opacity-40"
            disabled={atEnd}
            onClick={() => go(1)}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-muted" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}
