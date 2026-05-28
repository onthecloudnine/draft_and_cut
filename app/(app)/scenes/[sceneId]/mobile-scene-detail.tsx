"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { plainTextToHtml } from "@/components/rich-text-editor";
import { useI18n } from "@/lib/i18n/client";
import { productionStages } from "@/types/domain";

type SceneSiblingData = { id: string; sceneNumber: string; title: string };

type Shot = {
  id: string;
  shotNumber: string;
  shotType: string;
  status: string;
  description: string;
  action: string;
  camera: string;
  sound: string;
  requiredElements: string[];
  productionNotes: string;
  durationFrames: number | null;
  startFrame: number | null;
  endFrame: number | null;
};

type Scene = {
  id: string;
  projectId: string;
  sceneNumber: string;
  title: string;
  description: string;
  literaryHeading: string;
  literaryScript: string;
  location: string;
  timeOfDay: string;
  status: string;
  fpsDefault: number;
};

type Video = {
  id: string;
  shotId: string | null;
  scope: string;
  versionNumber: number;
  stage: string;
  status: string;
  fileName: string;
  duration: number;
  fps: number;
  resolution: string;
  isFavorite: boolean;
  url: string | null;
};

type HumanResource = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  stages: string[];
};

type Attachment = {
  id: string;
  title: string;
  description: string;
  attachmentDate: string;
  fileName: string;
  fileSizeMb: number;
  url: string | null;
  uploadedByName: string;
};

type MobileSceneDetailProps = {
  scene: Scene;
  shots: Shot[];
  videos: Video[];
  humanResources: HumanResource[];
  attachments: Attachment[];
  previousScene: SceneSiblingData | null;
  nextScene: SceneSiblingData | null;
};

type SheetTab = "shot" | "scene" | "script" | "team" | "files";
type SheetState = "peek" | "half" | "full";

const SHEET_HANDLE_HEIGHT = 56;

function framesToTimecode(frames: number | null | undefined, fps: number) {
  if (frames == null || !Number.isFinite(frames) || frames < 0) return "—";
  const safeFps = Math.max(1, Math.round(fps));
  const totalSeconds = frames / safeFps;
  const mm = Math.floor(totalSeconds / 60);
  const ss = Math.floor(totalSeconds % 60);
  const ff = Math.round(frames % safeFps);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}

export function MobileSceneDetail({
  scene,
  shots,
  videos,
  humanResources,
  attachments,
  previousScene,
  nextScene
}: MobileSceneDetailProps) {
  const { optionLabel, t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeThumbRef = useRef<HTMLLIElement | null>(null);
  const fps = Math.max(1, scene.fpsDefault);

  const [activeShotId, setActiveShotId] = useState(shots[0]?.id ?? "");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const [sheetTab, setSheetTab] = useState<SheetTab>("shot");
  const [isScriptOverlayOpen, setIsScriptOverlayOpen] = useState(false);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;
  const activeVideo =
    videos.find((video) => video.shotId === activeShot?.id) ??
    videos.find((video) => video.scope === "scene" || !video.shotId) ??
    videos[0] ??
    null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeShot) return;
    if (typeof activeShot.startFrame !== "number") return;
    const target = activeShot.startFrame / fps;
    const endSeconds =
      typeof activeShot.endFrame === "number" ? activeShot.endFrame / fps : null;
    const seek = () => {
      if (endSeconds !== null && video.currentTime >= target && video.currentTime < endSeconds) {
        return;
      }
      if (Math.abs(video.currentTime - target) < 0.05) return;
      try {
        video.currentTime = target;
      } catch {
        /* ignore */
      }
    };
    if (video.readyState >= 1) seek();
    else {
      video.addEventListener("loadedmetadata", seek, { once: true });
      return () => video.removeEventListener("loadedmetadata", seek);
    }
  }, [activeShot?.id, activeShot?.startFrame, activeShot?.endFrame, fps, activeVideo?.id]);

  useEffect(() => {
    if (!activeThumbRef.current) return;
    activeThumbRef.current.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeShot?.id]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    } else {
      video.pause();
    }
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const max = video.duration || duration || seconds;
    video.currentTime = Math.max(0, Math.min(seconds, max));
  };

  const activeIndex = activeShot ? shots.findIndex((shot) => shot.id === activeShot.id) : -1;
  const goPrev = () => {
    if (activeIndex <= 0) {
      seekTo(0);
      return;
    }
    setActiveShotId(shots[activeIndex - 1].id);
  };
  const goNext = () => {
    if (activeIndex < 0 || activeIndex >= shots.length - 1) return;
    setActiveShotId(shots[activeIndex + 1].id);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background text-fg">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Link
          className="rounded-md p-1.5 text-muted-strong hover:bg-elevated"
          href={`/projects/${scene.projectId}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-danger-fg">
            {t("scene.scene")} {scene.sceneNumber}
          </p>
          <p className="truncate text-xs font-medium text-fg">{scene.title}</p>
        </div>
        <div className="flex items-center gap-1">
          {previousScene ? (
            <Link
              aria-label={t("scene.previousScene", { sceneNumber: previousScene.sceneNumber })}
              className="rounded-md p-1.5 text-muted-strong hover:bg-elevated"
              href={`/scenes/${previousScene.id}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </Link>
          ) : null}
          {nextScene ? (
            <Link
              aria-label={t("scene.nextScene", { sceneNumber: nextScene.sceneNumber })}
              className="rounded-md p-1.5 text-muted-strong hover:bg-elevated"
              href={`/scenes/${nextScene.id}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ) : null}
        </div>
      </header>

      <div className="relative flex aspect-video w-full shrink-0 items-center justify-center bg-black">
        {activeVideo?.url ? (
          <video
            ref={videoRef}
            key={activeVideo.id}
            className="max-h-full max-w-full"
            controls={false}
            onClick={togglePlay}
            onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(event) => {
              const next = event.currentTarget.currentTime;
              setPlaybackSeconds((prev) => (Math.abs(next - prev) >= 0.066 ? next : prev));
            }}
            playsInline
            src={activeVideo.url}
          />
        ) : (
          <p className="px-6 text-center text-sm text-white/70">{t("scene.noPreviewBody")}</p>
        )}
      </div>

      <CompactTransport
        duration={duration}
        fps={fps}
        isPlaying={isPlaying}
        onNext={goNext}
        onPrev={goPrev}
        onSeek={seekTo}
        onTogglePlay={togglePlay}
        playbackSeconds={playbackSeconds}
      />

      <div className="shrink-0 border-y border-line bg-background">
        <ul className="flex items-stretch gap-1.5 overflow-x-auto px-3 py-2">
          {shots.map((shot) => {
            const isActive = shot.id === activeShot?.id;
            return (
              <li
                className="shrink-0"
                key={shot.id}
                ref={isActive ? activeThumbRef : null}
              >
                <button
                  className={[
                    "flex h-14 w-14 flex-col items-center justify-center rounded-md border text-[10px] font-semibold transition",
                    isActive
                      ? "border-red-500/80 bg-red-600/15 text-danger-fg ring-2 ring-red-500/40"
                      : "border-line bg-surface text-muted"
                  ].join(" ")}
                  onClick={() => {
                    setActiveShotId(shot.id);
                    setSheetTab("shot");
                  }}
                  type="button"
                >
                  <span>{shot.shotNumber}</span>
                  <span className="mt-0.5 text-[9px] text-muted">
                    {framesToTimecode(shot.startFrame, fps)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-h-0 flex-1" />

      <BottomSheet
        activeShot={activeShot}
        attachments={attachments}
        humanResources={humanResources}
        onChangeState={setSheetState}
        onChangeTab={setSheetTab}
        onOpenScript={() => setIsScriptOverlayOpen(true)}
        optionLabel={optionLabel}
        scene={scene}
        sheetState={sheetState}
        sheetTab={sheetTab}
        t={t}
      />

      {isScriptOverlayOpen ? (
        <ScriptViewer
          onClose={() => setIsScriptOverlayOpen(false)}
          scene={scene}
          t={t}
        />
      ) : null}
    </div>
  );
}

function CompactTransport({
  duration,
  fps,
  isPlaying,
  onNext,
  onPrev,
  onSeek,
  onTogglePlay,
  playbackSeconds
}: {
  duration: number;
  fps: number;
  isPlaying: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  playbackSeconds: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const safeDuration = duration > 0 ? duration : 0;
  const progress = safeDuration > 0 ? Math.max(0, Math.min(1, playbackSeconds / safeDuration)) : 0;

  const seekFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || safeDuration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    onSeek(ratio * safeDuration);
  };

  return (
    <div className="shrink-0 border-b border-line bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          aria-label="prev"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-fg active:bg-elevated"
          onClick={onPrev}
          type="button"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 5h2v14H6zM20 5v14L9 12z" />
          </svg>
        </button>
        <button
          aria-label="play"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white active:bg-red-500"
          onClick={onTogglePlay}
          type="button"
        >
          {isPlaying ? (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          aria-label="next"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-fg active:bg-elevated"
          onClick={onNext}
          type="button"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
          </svg>
        </button>
        <div className="flex shrink-0 items-center gap-1 rounded-md bg-surface px-2 py-1 text-[10px] tabular-nums text-muted-strong">
          <span className="font-semibold text-fg">
            {framesToTimecode(Math.round(playbackSeconds * fps), fps)}
          </span>
          <span className="text-muted">/</span>
          <span>{framesToTimecode(Math.round(safeDuration * fps), fps)}</span>
        </div>
      </div>
      <div
        ref={trackRef}
        className="mt-2 h-2 cursor-pointer touch-none select-none rounded-full bg-elevated"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsScrubbing(true);
          seekFromEvent(event);
        }}
        onPointerMove={(event) => {
          if (!isScrubbing) return;
          seekFromEvent(event);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsScrubbing(false);
        }}
      >
        <div className="relative h-full">
          <div className="h-full rounded-l-full bg-red-500" style={{ width: `${progress * 100}%` }} />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-300 bg-white shadow"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function BottomSheet({
  activeShot,
  attachments,
  humanResources,
  onChangeState,
  onChangeTab,
  onOpenScript,
  optionLabel,
  scene,
  sheetState,
  sheetTab,
  t
}: {
  activeShot: Shot | null;
  attachments: Attachment[];
  humanResources: HumanResource[];
  onChangeState: (state: SheetState) => void;
  onChangeTab: (tab: SheetTab) => void;
  onOpenScript: () => void;
  optionLabel: (group: string, value: string) => string;
  scene: Scene;
  sheetState: SheetState;
  sheetTab: SheetTab;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  const baseHeights: Record<SheetState, number> = {
    peek: SHEET_HANDLE_HEIGHT,
    half: typeof window !== "undefined" ? window.innerHeight * 0.5 : 400,
    full: typeof window !== "undefined" ? window.innerHeight * 0.88 : 700
  };
  const targetHeight = baseHeights[sheetState];
  const effectiveHeight = dragOffset !== null ? Math.max(SHEET_HANDLE_HEIGHT, dragOffset) : targetHeight;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { y: event.clientY, height: targetHeight };
    setDragOffset(targetHeight);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const delta = event.clientY - dragStartRef.current.y;
    setDragOffset(Math.max(SHEET_HANDLE_HEIGHT, dragStartRef.current.height - delta));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const finalHeight = dragOffset ?? dragStartRef.current.height;
    dragStartRef.current = null;
    setDragOffset(null);
    // Snap to nearest
    const peek = baseHeights.peek;
    const half = baseHeights.half;
    const full = baseHeights.full;
    const distances: Array<[SheetState, number]> = [
      ["peek", Math.abs(finalHeight - peek)],
      ["half", Math.abs(finalHeight - half)],
      ["full", Math.abs(finalHeight - full)]
    ];
    distances.sort((a, b) => a[1] - b[1]);
    onChangeState(distances[0][0]);
  };

  const tabs: Array<{ key: SheetTab; label: string }> = [
    { key: "shot", label: t("scene.tabShot") },
    { key: "scene", label: t("scene.tabScene") },
    { key: "script", label: t("scene.tabScript") },
    { key: "team", label: t("scene.tabTeam") },
    { key: "files", label: t("scene.tabFiles") }
  ];

  return (
    <aside
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl border-t border-line bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.4)]"
      style={{
        height: `${effectiveHeight}px`,
        transition: dragOffset === null ? "height 220ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none"
      }}
    >
      <div
        className="flex shrink-0 cursor-row-resize touch-none select-none flex-col items-center gap-1 px-4 pb-1 pt-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="h-1.5 w-12 rounded-full bg-line-strong" />
        <button
          className="-mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted"
          onClick={() => onChangeState(sheetState === "peek" ? "half" : sheetState === "half" ? "full" : "peek")}
          type="button"
        >
          {sheetState === "peek"
            ? t("mobile.tapToExpand")
            : sheetState === "half"
              ? t("mobile.tapToFull")
              : t("mobile.tapToCollapse")}
        </button>
      </div>

      <div className="flex shrink-0 items-center overflow-x-auto border-b border-line px-2">
        {tabs.map((tab) => {
          const active = tab.key === sheetTab;
          return (
            <button
              className={[
                "relative shrink-0 px-3 py-2.5 text-[12px] font-medium transition",
                active ? "text-fg-strong" : "text-muted"
              ].join(" ")}
              key={tab.key}
              onClick={() => {
                onChangeTab(tab.key);
                if (sheetState === "peek") onChangeState("half");
              }}
              type="button"
            >
              {tab.label}
              {active ? (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-red-500" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {sheetTab === "shot" ? (
          <ShotPanel activeShot={activeShot} fps={scene.fpsDefault} optionLabel={optionLabel} t={t} />
        ) : null}
        {sheetTab === "scene" ? (
          <ScenePanel optionLabel={optionLabel} scene={scene} t={t} />
        ) : null}
        {sheetTab === "script" ? (
          <ScriptPanel onOpenScript={onOpenScript} scene={scene} t={t} />
        ) : null}
        {sheetTab === "team" ? (
          <TeamPanel humanResources={humanResources} optionLabel={optionLabel} t={t} />
        ) : null}
        {sheetTab === "files" ? <FilesPanel attachments={attachments} t={t} /> : null}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="text-sm leading-6 text-fg">{children}</div>
    </div>
  );
}

function ShotPanel({
  activeShot,
  fps,
  optionLabel,
  t
}: {
  activeShot: Shot | null;
  fps: number;
  optionLabel: (group: string, value: string) => string;
  t: (path: string) => string;
}) {
  if (!activeShot) {
    return <p className="text-sm text-muted">{t("scene.emptyShots")}</p>;
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-fg-strong">
          {t("scene.tabShot")} {activeShot.shotNumber}
        </h2>
        <span className="rounded-md border border-line bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-muted-strong">
          {optionLabel("shotStatuses", activeShot.status)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        <Tile label={t("scene.startTc")}>{framesToTimecode(activeShot.startFrame, fps)}</Tile>
        <Tile label={t("scene.endTc")}>{framesToTimecode(activeShot.endFrame, fps)}</Tile>
        <Tile label={t("scene.durationTc")}>{framesToTimecode(activeShot.durationFrames, fps)}</Tile>
      </div>
      {activeShot.shotType ? <Field label={t("scene.type")}>{activeShot.shotType}</Field> : null}
      {activeShot.description ? <Field label={t("scene.description")}>{activeShot.description}</Field> : null}
      {activeShot.action ? <Field label={t("scene.action")}>{activeShot.action}</Field> : null}
      {activeShot.camera ? <Field label={t("scene.camera")}>{activeShot.camera}</Field> : null}
      {activeShot.sound ? <Field label={t("scene.soundTransition")}>{activeShot.sound}</Field> : null}
      {activeShot.requiredElements.length > 0 ? (
        <Field label={t("scene.requiredElements")}>
          <ul className="grid gap-1">
            {activeShot.requiredElements.map((item, idx) => (
              <li className="rounded-md border border-line bg-background px-2 py-1 text-xs text-fg" key={idx}>
                {item}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
      {activeShot.productionNotes ? (
        <Field label={t("scene.productionNotes")}>{activeShot.productionNotes}</Field>
      ) : null}
    </div>
  );
}

function ScenePanel({
  optionLabel,
  scene,
  t
}: {
  optionLabel: (group: string, value: string) => string;
  scene: Scene;
  t: (path: string) => string;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-fg-strong">{scene.title}</h2>
        <span className="shrink-0 rounded-md border border-line bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-muted-strong">
          {optionLabel("sceneStatuses", scene.status)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <Tile label={t("scene.location")}>{scene.location || "—"}</Tile>
        <Tile label={t("scene.timeOfDay")}>{scene.timeOfDay || "—"}</Tile>
      </div>
      {scene.description ? <Field label={t("scene.dramaticIntent")}>{scene.description}</Field> : null}
    </div>
  );
}

function ScriptPanel({
  onOpenScript,
  scene,
  t
}: {
  onOpenScript: () => void;
  scene: Scene;
  t: (path: string) => string;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg-strong">{t("scene.literaryScript")}</h2>
        <button
          className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-muted-strong"
          onClick={onOpenScript}
          type="button"
        >
          {t("scene.openInOverlay")}
        </button>
      </div>
      {scene.literaryHeading ? (
        <p className="text-xs uppercase tracking-wider text-muted">{scene.literaryHeading}</p>
      ) : null}
      {scene.literaryScript ? (
        <div
          className="prose-editor text-[14px] leading-6 text-fg"
          dangerouslySetInnerHTML={{ __html: plainTextToHtml(scene.literaryScript) }}
        />
      ) : (
        <p className="text-sm italic text-muted">{t("scene.missingLiteraryScript")}</p>
      )}
    </div>
  );
}

function TeamPanel({
  humanResources,
  optionLabel,
  t
}: {
  humanResources: HumanResource[];
  optionLabel: (group: string, value: string) => string;
  t: (path: string) => string;
}) {
  if (humanResources.length === 0) {
    return <p className="text-sm text-muted">{t("scene.noResponsibles")}</p>;
  }
  return (
    <ul className="grid gap-2">
      {humanResources.map((resource) => (
        <li className="rounded-md border border-line bg-background p-3 text-xs" key={resource.id}>
          <p className="text-sm font-semibold text-fg-strong">{resource.name}</p>
          <p className="mt-0.5 text-muted">{resource.email}</p>
          <p className="mt-1 text-[10px] font-medium uppercase text-danger-fg">{resource.role}</p>
          {resource.stages.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {productionStages
                .filter((stage) => resource.stages.includes(stage))
                .map((stage) => (
                  <span
                    className="rounded-full border border-red-600 bg-red-600/15 px-1.5 py-0.5 text-[9px] font-medium text-fg"
                    key={stage}
                  >
                    {optionLabel("productionStages", stage)}
                  </span>
                ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function FilesPanel({
  attachments,
  t
}: {
  attachments: Attachment[];
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted">{t("scene.noAttachments")}</p>;
  }
  return (
    <ul className="grid gap-2">
      {attachments.map((attachment) => (
        <li className="rounded-md border border-line bg-background p-3 text-xs" key={attachment.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg-strong">{attachment.title}</p>
              <p className="mt-0.5 text-muted">
                {formatDate(attachment.attachmentDate)} · {attachment.uploadedByName}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] text-muted-strong">
              {attachment.fileSizeMb} MB
            </span>
          </div>
          {attachment.description ? <p className="mt-1.5 text-muted">{attachment.description}</p> : null}
          {attachment.url ? (
            <a
              className="mt-2 inline-flex text-[11px] font-medium text-danger-fg"
              href={attachment.url}
              rel="noreferrer"
              target="_blank"
            >
              {t("scene.openFile", { fileName: attachment.fileName })}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-background px-2 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-xs tabular-nums text-fg">{children}</p>
    </div>
  );
}

function ScriptViewer({
  onClose,
  scene,
  t
}: {
  onClose: () => void;
  scene: Scene;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-background sm:max-w-2xl sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">
              {t("scene.scene")} {scene.sceneNumber} · {t("scene.literaryScript")}
            </p>
            {scene.literaryHeading ? (
              <h2 className="mt-1 truncate text-sm font-semibold text-fg-strong">{scene.literaryHeading}</h2>
            ) : null}
          </div>
          <button
            aria-label={t("scene.cancel")}
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-elevated"
            onClick={onClose}
            type="button"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
          {scene.literaryScript ? (
            <div
              className="prose-editor"
              dangerouslySetInnerHTML={{ __html: plainTextToHtml(scene.literaryScript) }}
            />
          ) : (
            <p className="text-sm italic text-muted">{t("scene.missingLiteraryScript")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
