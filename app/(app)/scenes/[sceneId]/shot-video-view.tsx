"use client";

import { useMemo, useRef, useState } from "react";
import { uploadShotVideo } from "@/lib/uploads/client";
import { PHASE_STAGES } from "./phase-types";
import { ShotTimelineStrip } from "./shot-timeline-strip";

type ShotVideoData = {
  id: string;
  shotId: string | null;
  scope: string;
  stage: string;
  versionNumber: number;
  status: string;
  fileName: string;
  url: string | null;
};

type ShotItem = { id: string; shotNumber: string; durationFrames: number | null };

type SceneInfo = { id: string; projectId: string; fpsDefault: number };

export function ShotVideoView({
  phase,
  scene,
  shots,
  initialVideos,
  activeShotId,
  onSelectShot,
  canManageVideos,
  optionLabel,
  t
}: {
  phase: "playblast" | "render";
  scene: SceneInfo;
  shots: ShotItem[];
  initialVideos: ShotVideoData[];
  activeShotId: string;
  onSelectShot: (shotId: string) => void;
  canManageVideos: boolean;
  optionLabel: (group: string, value: string) => string;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const stages = PHASE_STAGES[phase];
  const [videos, setVideos] = useState<ShotVideoData[]>(() =>
    initialVideos.filter((video) => video.scope === "shot" && stages.includes(video.stage))
  );
  const [stage, setStage] = useState<string>(stages[0]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;

  // Which shots already have at least one clip in this phase (any of its stages).
  const shotsWithMedia = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((video) => {
      if (video.shotId) set.add(video.shotId);
    });
    return set;
  }, [videos]);

  const stageVideos = useMemo(
    () =>
      videos
        .filter((video) => video.shotId === activeShot?.id && video.stage === stage)
        .sort((a, b) => b.versionNumber - a.versionNumber),
    [videos, activeShot?.id, stage]
  );

  const activeVideo =
    stageVideos.find((video) => video.id === selectedVersionId) ?? stageVideos[0] ?? null;

  async function handleFile(file: File) {
    if (!activeShot) return;
    setError("");
    setIsUploading(true);
    try {
      const result = await uploadShotVideo({
        projectId: scene.projectId,
        sceneId: scene.id,
        shotId: activeShot.id,
        stage,
        fps: scene.fpsDefault,
        file
      });
      const newVideo: ShotVideoData = {
        id: `local-${Date.now()}`,
        shotId: activeShot.id,
        scope: "shot",
        stage,
        versionNumber: result.versionNumber,
        status: "ready_for_review",
        fileName: file.name,
        url: result.objectUrl
      };
      setVideos((current) => [newVideo, ...current]);
      setSelectedVersionId(newVideo.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error al subir el video");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Controls: stage sub-selector + version + upload */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[11px] font-medium text-muted">
          {activeShot ? `${t("scene.shotShort")} ${activeShot.shotNumber}` : ""}
        </span>
        <div className="flex items-center gap-1">
          {stages.map((item) => (
            <button
              className={[
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                item === stage
                  ? "border-red-600 bg-red-600/15 text-fg-strong"
                  : "border-line bg-background text-muted hover:bg-surface"
              ].join(" ")}
              key={item}
              onClick={() => {
                setStage(item);
                setSelectedVersionId("");
              }}
              type="button"
            >
              {optionLabel("productionStages", item)}
            </button>
          ))}
        </div>

        {stageVideos.length > 0 ? (
          <select
            className="ml-auto h-8 rounded-md border border-line-strong bg-background px-2 text-xs text-fg"
            onChange={(event) => setSelectedVersionId(event.target.value)}
            value={activeVideo?.id ?? ""}
          >
            {stageVideos.map((video) => (
              <option key={video.id} value={video.id}>
                v{video.versionNumber}
              </option>
            ))}
          </select>
        ) : null}

        {canManageVideos ? (
          <button
            className={`${stageVideos.length > 0 ? "" : "ml-auto "}h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60`}
            disabled={isUploading || !activeShot}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isUploading ? t("scene.phaseUploadBusy") : t("scene.phaseUploadVideo")}
          </button>
        ) : null}
        <input
          accept="video/mp4"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {/* Player */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
        {activeVideo?.url ? (
          <video className="max-h-full max-w-full" controls key={activeVideo.id} src={activeVideo.url} />
        ) : (
          <div className="text-center text-sm text-muted">
            <p>{t("scene.phaseNoMedia")}</p>
            {canManageVideos ? <p className="mt-1 text-xs">{t("scene.phaseNoMediaHint")}</p> : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="shrink-0 border-t border-danger bg-danger-soft px-4 py-2 text-xs text-danger-fg">{error}</p>
      ) : null}

      {/* Timeline strip */}
      <ShotTimelineStrip
        shots={shots}
        fps={scene.fpsDefault}
        activeShotId={activeShot?.id ?? ""}
        onSelect={(shotId) => {
          onSelectShot(shotId);
          setSelectedVersionId("");
        }}
        hasMediaShotIds={shotsWithMedia}
        t={t}
      />
    </div>
  );
}
