"use client";

import { useEffect, useMemo, useRef } from "react";

const PIXELS_PER_SECOND = 50;
const MIN_SEGMENT_WIDTH_PX = 96;
const FALLBACK_SECONDS = 2;
const STRIP_PADDING_LEFT_PX = 12; // px-3
const STRIP_GAP_PX = 4; // gap-1

type StripShot = { id: string; shotNumber: string; title?: string; durationFrames: number | null };

// Horizontal timeline strip of shots, shared across phases so every phase keeps
// the same timeline-style layout: shots are segments whose width is proportional
// to their duration (matching the animatic timeline). Each segment can show a
// storyboard thumbnail and/or a media indicator dot.
export function ShotTimelineStrip({
  shots,
  fps,
  activeShotId,
  onSelect,
  thumbnailByShot,
  hasMediaShotIds,
  playhead,
  t
}: {
  shots: StripShot[];
  fps: number;
  activeShotId: string;
  onSelect: (shotId: string) => void;
  thumbnailByShot?: Record<string, string | null>;
  hasMediaShotIds?: Set<string>;
  playhead?: { shotId: string; progress: number } | null;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const widths = useMemo(
    () =>
      shots.map((shot) => {
        const secs =
          typeof shot.durationFrames === "number" && shot.durationFrames > 0
            ? shot.durationFrames / Math.max(1, fps)
            : FALLBACK_SECONDS;
        return Math.max(MIN_SEGMENT_WIDTH_PX, Math.round(secs * PIXELS_PER_SECOND));
      }),
    [shots, fps]
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeShotId]);

  // Segment buttons depend on shots/selection/media, NOT on the playhead — so they
  // are memoized and reused while the playhead sweeps (which re-renders ~4x/sec
  // during playback). Only the playhead line below recomputes on each tick.
  const segments = useMemo(
    () =>
      shots.map((shot, idx) => {
        const isActive = shot.id === activeShotId;
        const thumb = thumbnailByShot?.[shot.id] ?? null;
        const hasMedia = hasMediaShotIds?.has(shot.id) ?? Boolean(thumb);
        return (
          <button
            className={[
              "relative flex h-20 shrink-0 flex-col justify-end overflow-hidden rounded-md border text-left transition",
              isActive ? "border-red-500 ring-1 ring-red-500" : "border-line hover:border-line-strong"
            ].join(" ")}
            key={shot.id}
            onClick={() => onSelect(shot.id)}
            ref={isActive ? activeRef : null}
            style={{ width: `${widths[idx]}px` }}
            type="button"
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" src={thumb} />
            ) : (
              <span className="absolute inset-0 bg-elevated" aria-hidden />
            )}
            <span className="relative flex items-center justify-between gap-1 bg-black/55 px-1.5 py-0.5">
              <span className="truncate text-[10px] font-semibold text-white">
                {shot.title ? shot.title : `${t("scene.shotShort")} ${shot.shotNumber}`}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${hasMedia ? "bg-red-500" : "bg-white/40"}`}
                aria-hidden
              />
            </span>
          </button>
        );
      }),
    [shots, activeShotId, thumbnailByShot, hasMediaShotIds, widths, onSelect, t]
  );

  // Continuous playhead X (in the inner container's coordinate space): offset of
  // the playing shot's segment + progress within it. Sweeps across segments.
  const playheadX = useMemo(() => {
    if (!playhead) return null;
    const idx = shots.findIndex((shot) => shot.id === playhead.shotId);
    if (idx < 0) return null;
    let x = STRIP_PADDING_LEFT_PX;
    for (let i = 0; i < idx; i += 1) {
      x += widths[i] + STRIP_GAP_PX;
    }
    x += Math.max(0, Math.min(1, playhead.progress)) * widths[idx];
    return x;
  }, [playhead, shots, widths]);

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t("scene.timelineLabel")}
        </span>
        <span className="text-[11px] text-muted">
          {shots.length} {t("scene.shotsCount")}
        </span>
      </div>
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="relative w-max">
          {/* Time ruler where the playhead head sits, NLE-style */}
          <div className="h-5 border-b border-line bg-elevated/30" />

          <div className="flex items-stretch gap-1 px-3 pb-3 pt-1">
            {segments}
            {shots.length === 0 ? (
              <div className="flex h-20 w-full items-center justify-center text-sm text-muted">
                {t("scene.emptyShots")}
              </div>
            ) : null}
          </div>

          {/* Playhead: a head (triangle) in the ruler + a line spanning the whole timeline */}
          {playheadX !== null ? (
            <div
              className="pointer-events-none absolute bottom-3 top-0 z-20"
              style={{ left: `${playheadX}px` }}
              aria-hidden
            >
              <div className="absolute left-0 top-0 h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
              <div className="absolute bottom-0 left-0 top-0 w-px -translate-x-1/2 bg-red-500 shadow-[0_0_3px_rgba(239,68,68,0.7)]" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
