"use client";

import { useMemo, useRef, useState } from "react";
import { uploadSceneAudio } from "@/lib/uploads/client";
import { soundStems } from "@/types/domain";
import type { AudioVersionData } from "./phase-types";

export function AudioTracksPanel({
  sceneId,
  soundOptions,
  initialAudio,
  canManage,
  optionLabel,
  t
}: {
  sceneId: string;
  soundOptions: string[];
  initialAudio: AudioVersionData[];
  canManage: boolean;
  optionLabel: (group: string, value: string) => string;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [tracks, setTracks] = useState<AudioVersionData[]>(initialAudio);
  const [uploadingStem, setUploadingStem] = useState<string>("");
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [soloed, setSoloed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingStemRef = useRef<string>("");

  // Which stems to show as lanes: those declared on the scene, falling back to
  // all stems so tracks can still be uploaded.
  const stems = useMemo(() => {
    const declared = soundStems.filter((stem) => soundOptions.includes(stem));
    return declared.length > 0 ? declared : [...soundStems];
  }, [soundOptions]);

  const latestByStem = useMemo(() => {
    const map = new Map<string, AudioVersionData>();
    tracks.forEach((track) => {
      const current = map.get(track.stem);
      if (!current || track.versionNumber > current.versionNumber) {
        map.set(track.stem, track);
      }
    });
    return map;
  }, [tracks]);

  const anySolo = Object.values(soloed).some(Boolean);

  function isAudible(stem: string) {
    if (anySolo) return Boolean(soloed[stem]);
    return !muted[stem];
  }

  function stopAll() {
    Object.values(audioRefs.current).forEach((el) => {
      if (el) el.pause();
    });
  }

  function playAll() {
    stems.forEach((stem) => {
      const el = audioRefs.current[stem];
      if (!el) return;
      if (isAudible(stem)) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      } else {
        el.pause();
      }
    });
  }

  async function handleFile(file: File) {
    const stem = pendingStemRef.current;
    if (!stem) return;
    setError("");
    setUploadingStem(stem);
    try {
      const result = await uploadSceneAudio({ sceneId, stem, file });
      const newTrack: AudioVersionData = {
        id: `local-${Date.now()}`,
        stem,
        versionNumber: result.versionNumber,
        fileName: file.name,
        mimeType: file.type,
        duration: 0,
        url: result.objectUrl
      };
      setTracks((current) => [newTrack, ...current]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error al subir el audio");
    } finally {
      setUploadingStem("");
      pendingStemRef.current = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function triggerUpload(stem: string) {
    pendingStemRef.current = stem;
    fileInputRef.current?.click();
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("scene.audioTitle")}</span>
        <button
          className="rounded border border-line-strong px-2 py-0.5 text-[10px] font-medium text-fg hover:bg-elevated"
          onClick={playAll}
          type="button"
        >
          ▶ {t("scene.audioPlayAll")}
        </button>
        <button
          className="rounded border border-line-strong px-2 py-0.5 text-[10px] font-medium text-muted-strong hover:bg-elevated"
          onClick={stopAll}
          type="button"
        >
          ■ {t("scene.audioStop")}
        </button>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {stems.map((stem) => {
          const track = latestByStem.get(stem);
          const busy = uploadingStem === stem;
          return (
            <div className="flex items-center gap-2 rounded-md border border-line bg-background px-2 py-1.5" key={stem}>
              <span className="w-16 shrink-0 truncate text-[11px] font-medium text-fg">
                {optionLabel("sceneSoundOptions", stem)}
              </span>
              {track?.url ? (
                <>
                  <span className="text-[10px] text-muted">v{track.versionNumber}</span>
                  <audio
                    preload="none"
                    ref={(el) => {
                      audioRefs.current[stem] = el;
                    }}
                    src={track.url}
                  />
                  <button
                    className="rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-fg hover:bg-elevated"
                    onClick={() => {
                      const el = audioRefs.current[stem];
                      if (!el) return;
                      if (el.paused) void el.play().catch(() => undefined);
                      else el.pause();
                    }}
                    type="button"
                  >
                    ▶/■
                  </button>
                  <button
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${muted[stem] ? "border-red-600 text-red-400" : "border-line-strong text-muted"}`}
                    onClick={() => setMuted((current) => ({ ...current, [stem]: !current[stem] }))}
                    type="button"
                  >
                    M
                  </button>
                  <button
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${soloed[stem] ? "border-red-600 text-red-400" : "border-line-strong text-muted"}`}
                    onClick={() => setSoloed((current) => ({ ...current, [stem]: !current[stem] }))}
                    type="button"
                  >
                    S
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-muted">{t("scene.audioEmpty")}</span>
              )}
              {canManage ? (
                <button
                  className="ml-auto rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted-strong hover:bg-elevated disabled:opacity-60"
                  disabled={busy}
                  onClick={() => triggerUpload(stem)}
                  type="button"
                >
                  {busy ? "…" : track ? t("scene.phaseReplace") : t("scene.phaseUploadAudio")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <input
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        ref={fileInputRef}
        type="file"
      />

      {error ? <p className="mt-1.5 text-[10px] text-danger-fg">{error}</p> : null}
    </div>
  );
}
