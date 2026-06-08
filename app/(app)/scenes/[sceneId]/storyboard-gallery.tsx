"use client";

import { useMemo, useRef, useState } from "react";
import { uploadStoryboardImage } from "@/lib/uploads/client";
import type { StoryboardFrameData } from "./phase-types";
import { ShotTimelineStrip } from "./shot-timeline-strip";

type ShotItem = { id: string; shotNumber: string; durationFrames: number | null };

export function StoryboardGallery({
  sceneId,
  shots,
  initialFrames,
  activeShotId,
  onSelectShot,
  canManage,
  t
}: {
  sceneId: string;
  shots: ShotItem[];
  initialFrames: StoryboardFrameData[];
  activeShotId: string;
  onSelectShot: (shotId: string) => void;
  canManage: boolean;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [frames, setFrames] = useState<StoryboardFrameData[]>(initialFrames);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;

  // Latest frame (highest version) per shot.
  const latestByShot = useMemo(() => {
    const map = new Map<string, StoryboardFrameData>();
    frames.forEach((frame) => {
      const current = map.get(frame.shotId);
      if (!current || frame.versionNumber > current.versionNumber) {
        map.set(frame.shotId, frame);
      }
    });
    return map;
  }, [frames]);

  const thumbnailByShot = useMemo(() => {
    const record: Record<string, string | null> = {};
    latestByShot.forEach((frame, shotId) => {
      record[shotId] = frame.url;
    });
    return record;
  }, [latestByShot]);

  const activeFrame = activeShot ? latestByShot.get(activeShot.id) ?? null : null;

  async function handleFile(file: File) {
    if (!activeShot) return;
    setError("");
    setIsUploading(true);
    try {
      const result = await uploadStoryboardImage({ sceneId, shotId: activeShot.id, file });
      const newFrame: StoryboardFrameData = {
        id: `local-${Date.now()}`,
        shotId: activeShot.id,
        versionNumber: result.versionNumber,
        fileName: file.name,
        mimeType: file.type,
        width: null,
        height: null,
        url: result.objectUrl
      };
      setFrames((current) => [newFrame, ...current]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error al subir la imagen");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: active shot + upload */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[11px] font-medium text-muted">
          {activeShot ? `${t("scene.shotShort")} ${activeShot.shotNumber}` : ""}
        </span>
        {canManage ? (
          <button
            className="ml-auto h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            disabled={isUploading || !activeShot}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isUploading
              ? t("scene.phaseUploadBusy")
              : activeFrame
                ? t("scene.phaseReplace")
                : t("scene.phaseUploadImage")}
          </button>
        ) : null}
        <input
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {/* Large preview of the active shot's frame */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
        {activeFrame?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="max-h-full max-w-full rounded" src={activeFrame.url} />
        ) : (
          <div className="text-center text-sm text-muted">
            <p>{t("scene.phaseNoImage")}</p>
            {canManage ? <p className="mt-1 text-xs">{t("scene.phaseNoMediaHint")}</p> : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="shrink-0 border-t border-danger bg-danger-soft px-4 py-2 text-xs text-danger-fg">{error}</p>
      ) : null}

      {/* Timeline strip of storyboard thumbnails */}
      <ShotTimelineStrip
        shots={shots}
        fps={24}
        activeShotId={activeShot?.id ?? ""}
        onSelect={onSelectShot}
        thumbnailByShot={thumbnailByShot}
        t={t}
      />
    </div>
  );
}
