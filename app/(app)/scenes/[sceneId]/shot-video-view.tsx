"use client";

import { useMemo, useRef, useState } from "react";
import { uploadShotVideo } from "@/lib/uploads/client";
import { shotStatuses } from "@/types/domain";
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

type ShotItem = {
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
};

type SceneInfo = { id: string; projectId: string; fpsDefault: number };

export function ShotVideoView({
  phase,
  scene,
  shots,
  initialVideos,
  activeShotId,
  onSelectShot,
  canManageVideos,
  canEditShots,
  onUpdateShot,
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
  canEditShots: boolean;
  onUpdateShot: (shotId: string, patch: Partial<Omit<ShotItem, "id">>) => void;
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
  const [scenePlaying, setScenePlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Scene playback assembles the scene from each shot's clip (current stage) and
  // plays them in sequence; refs hold the playlist across the per-clip remounts.
  const scenePlaylistRef = useRef<Array<{ shotId: string; videoId: string }>>([]);
  const scenePosRef = useRef(0);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;

  // Latest ready clip for a shot in the current stage.
  function latestClipForShot(shotId: string) {
    return (
      videos
        .filter((video) => video.shotId === shotId && video.stage === stage && video.url)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
    );
  }

  function stopScenePlayback() {
    if (scenePlaying) setScenePlaying(false);
  }

  function startScenePlayback() {
    const playlist = shots
      .map((shot) => {
        const clip = latestClipForShot(shot.id);
        return clip ? { shotId: shot.id, videoId: clip.id } : null;
      })
      .filter((item): item is { shotId: string; videoId: string } => Boolean(item));

    if (playlist.length === 0) {
      setError(t("scene.phaseSceneNoClips"));
      return;
    }

    setError("");
    scenePlaylistRef.current = playlist;
    scenePosRef.current = 0;
    setScenePlaying(true);
    onSelectShot(playlist[0].shotId);
    setSelectedVersionId(playlist[0].videoId);
  }

  function handleVideoEnded() {
    if (!scenePlaying) return;
    const nextPos = scenePosRef.current + 1;
    if (nextPos < scenePlaylistRef.current.length) {
      scenePosRef.current = nextPos;
      const next = scenePlaylistRef.current[nextPos];
      onSelectShot(next.shotId);
      setSelectedVersionId(next.videoId);
    } else {
      setScenePlaying(false);
    }
  }

  // Manual selection (strip / chips / version) interrupts scene playback.
  function handleManualSelectShot(shotId: string) {
    stopScenePlayback();
    onSelectShot(shotId);
    setSelectedVersionId("");
  }

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
                stopScenePlayback();
                setStage(item);
                setSelectedVersionId("");
              }}
              type="button"
            >
              {optionLabel("productionStages", item)}
            </button>
          ))}
        </div>

        <button
          className="rounded-md border border-line-strong px-3 py-1 text-xs font-medium text-fg hover:bg-elevated"
          onClick={() => (scenePlaying ? stopScenePlayback() : startScenePlayback())}
          type="button"
        >
          {scenePlaying ? `■ ${t("scene.phaseStopScene")}` : `▶ ${t("scene.phasePlayScene")}`}
        </button>

        {stageVideos.length > 0 ? (
          <select
            className="ml-auto h-8 rounded-md border border-line-strong bg-background px-2 text-xs text-fg"
            onChange={(event) => {
              stopScenePlayback();
              setSelectedVersionId(event.target.value);
            }}
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

      {/* Player + shot info panel */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
          {activeVideo?.url ? (
            <video
              autoPlay={scenePlaying}
              className="max-h-full max-w-full"
              controls
              key={activeVideo.id}
              onEnded={handleVideoEnded}
              onLoadedMetadata={() => setPlayProgress(0)}
              onTimeUpdate={(event) => {
                const el = event.currentTarget;
                setPlayProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
              }}
              src={activeVideo.url}
            />
          ) : (
            <div className="text-center text-sm text-muted">
              <p>{t("scene.phaseNoMedia")}</p>
              {canManageVideos ? <p className="mt-1 text-xs">{t("scene.phaseNoMediaHint")}</p> : null}
            </div>
          )}
        </div>

        <ShotInfoPanel
          shot={activeShot}
          canEdit={canEditShots}
          onUpdateShot={onUpdateShot}
          optionLabel={optionLabel}
          t={t}
        />
      </div>

      {error ? (
        <p className="shrink-0 border-t border-danger bg-danger-soft px-4 py-2 text-xs text-danger-fg">{error}</p>
      ) : null}

      {/* Timeline strip */}
      <ShotTimelineStrip
        shots={shots}
        fps={scene.fpsDefault}
        activeShotId={activeShot?.id ?? ""}
        onSelect={handleManualSelectShot}
        hasMediaShotIds={shotsWithMedia}
        playhead={activeVideo?.url && activeShot ? { shotId: activeShot.id, progress: playProgress } : null}
        t={t}
      />
    </div>
  );
}

function ShotInfoPanel({
  shot,
  canEdit,
  onUpdateShot,
  optionLabel,
  t
}: {
  shot: ShotItem | null;
  canEdit: boolean;
  onUpdateShot: (shotId: string, patch: Partial<Omit<ShotItem, "id">>) => void;
  optionLabel: (group: string, value: string) => string;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  if (!shot) {
    return (
      <aside className="hidden w-72 shrink-0 border-l border-line bg-surface p-4 text-sm text-muted lg:block">
        {t("scene.phaseNoShot")}
      </aside>
    );
  }

  const textFields: Array<{ key: "shotType" | "camera" | "sound"; label: string }> = [
    { key: "shotType", label: t("scene.shotType") },
    { key: "camera", label: t("scene.camera") },
    { key: "sound", label: t("scene.sound") }
  ];
  const longFields: Array<{ key: "action" | "description" | "productionNotes"; label: string }> = [
    { key: "action", label: t("scene.action") },
    { key: "description", label: t("scene.description") },
    { key: "productionNotes", label: t("scene.productionNotes") }
  ];

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-surface lg:block">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold text-fg-strong">
          {t("scene.shotShort")} {shot.shotNumber}
        </span>
        {canEdit ? (
          <select
            className="rounded-md border border-line-strong bg-background px-2 py-0.5 text-[11px] text-fg"
            onChange={(event) => onUpdateShot(shot.id, { status: event.target.value })}
            value={shot.status}
          >
            {shotStatuses.map((status) => (
              <option key={status} value={status}>
                {optionLabel("shotStatuses", status)}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
            {optionLabel("shotStatuses", shot.status)}
          </span>
        )}
      </div>
      <div className="grid gap-3 p-4">
        {typeof shot.durationFrames === "number" ? (
          <Field label={t("scene.duration")} value={`${shot.durationFrames} ${t("scene.frames")}`} />
        ) : null}

        {textFields.map((field) => (
          <div className="grid gap-1" key={field.key}>
            <FieldLabel>{field.label}</FieldLabel>
            {canEdit ? (
              <input
                className="h-8 rounded-md border border-line-strong bg-background px-2 text-sm text-fg"
                onChange={(event) => onUpdateShot(shot.id, { [field.key]: event.target.value })}
                value={shot[field.key]}
              />
            ) : (
              <ReadValue value={shot[field.key]} />
            )}
          </div>
        ))}

        {longFields.map((field) => (
          <div className="grid gap-1" key={field.key}>
            <FieldLabel>{field.label}</FieldLabel>
            {canEdit ? (
              <textarea
                className="min-h-16 rounded-md border border-line-strong bg-background px-2 py-1 text-sm leading-6 text-fg"
                onChange={(event) => onUpdateShot(shot.id, { [field.key]: event.target.value })}
                value={shot[field.key]}
              />
            ) : (
              <ReadValue value={shot[field.key]} />
            )}
          </div>
        ))}

        <div className="grid gap-1">
          <FieldLabel>{t("scene.requiredElements")}</FieldLabel>
          {shot.requiredElements.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {shot.requiredElements.map((element) => (
                <span
                  className="rounded-full border border-line bg-background px-2 py-0.5 text-[11px] text-fg"
                  key={element}
                >
                  {element}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
      </div>
    </aside>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <FieldLabel>{label}</FieldLabel>
      <ReadValue value={value} />
    </div>
  );
}

function ReadValue({ value }: { value: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-6 text-fg">{value?.trim() ? value : "—"}</p>;
}
