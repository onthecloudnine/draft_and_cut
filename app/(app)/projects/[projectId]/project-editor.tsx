"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { secondsToFrame, secondsToTimecode } from "@/lib/timecode";

type EditorVersion = {
  id: string;
  versionNumber: number;
  stage: string;
  status: string;
  fileName: string;
  duration: number;
  fps: number;
  frameCount: number;
  resolution: string;
  isFavorite: boolean;
  createdAt?: string;
  url: string | null;
};

type EditorScene = {
  id: string;
  sceneNumber: string;
  title: string;
  description: string;
  location: string;
  timeOfDay: string;
  status: string;
  sortOrder: number;
  openComments: number;
  selectedVideoId: string | null;
  versions: EditorVersion[];
  script: {
    sceneText: string;
    shots: Array<{
      id: string;
      shotNumber: string;
      shotType: string;
      description: string;
      action: string;
      camera: string;
      sound: string;
      requiredElements: string[];
      productionNotes: string;
    }>;
  };
};

type ProjectEditorData = {
  project: {
    id: string;
    slug: string;
    title: string;
    description: string;
    fpsDefault: number;
  };
  scenes: EditorScene[];
};

function formatDuration(seconds: number, fps: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00:00:00";
  }

  return secondsToTimecode(seconds, fps);
}

function getSelectedVersion(scene: EditorScene) {
  return (
    scene.versions.find((version) => version.id === scene.selectedVideoId) ??
    scene.versions.find((version) => version.isFavorite) ??
    scene.versions[0] ??
    null
  );
}

function VideoPlaceholder({
  sceneNumber,
  hasVersion
}: {
  sceneNumber?: string;
  hasVersion: boolean;
}) {
  return (
    <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_center,#1f2937_0,#020617_62%)] px-6">
      <div className="grid w-full max-w-3xl gap-5 text-center">
        <div className="relative aspect-video overflow-hidden rounded-md border border-neutral-700 bg-black shadow-2xl">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(45deg,#334155_25%,transparent_25%),linear-gradient(-45deg,#334155_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#334155_75%),linear-gradient(-45deg,transparent_75%,#334155_75%)] [background-position:0_0,0_10px,10px_-10px,-10px_0] [background-size:20px_20px]" />
          <div className="absolute inset-x-0 top-0 h-8 border-b border-neutral-800 bg-neutral-900" />
          <div className="absolute inset-x-0 bottom-0 h-8 border-t border-neutral-800 bg-neutral-900" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid h-20 w-20 place-items-center rounded-full border border-neutral-600 bg-neutral-900/80">
              <div className="ml-1 h-0 w-0 border-y-[14px] border-l-[22px] border-y-transparent border-l-slate-400" />
            </div>
          </div>
          <div className="absolute left-4 top-12 rounded bg-black/50 px-2 py-1 text-xs font-medium text-slate-300">
            {sceneNumber ? `SC ${sceneNumber}` : "NO CLIP"}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {hasVersion ? "Clip sin previsualizacion disponible" : "Sin clip cargado en esta escena"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {hasVersion
              ? "La version existe, pero no se pudo generar una URL de reproduccion. Revisa S3 o el estado de subida."
              : "Sube una version de video para verla en el viewer principal de la secuencia."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProjectEditor({ initialData }: { initialData: ProjectEditorData }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldAutoPlayRef = useRef(false);
  const [scenes, setScenes] = useState(initialData.scenes);
  const [activeSceneId, setActiveSceneId] = useState(initialData.scenes[0]?.id ?? "");
  const [currentTime, setCurrentTime] = useState(0);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [openMenuSceneId, setOpenMenuSceneId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0] ?? null;
  const activeVersion = activeScene ? getSelectedVersion(activeScene) : null;
  const fps = activeVersion?.fps ?? initialData.project.fpsDefault;

  const timeline = useMemo(() => {
    let elapsed = 0;

    return scenes.map((scene) => {
      const version = getSelectedVersion(scene);
      const duration = version?.duration ?? 0;
      const item = {
        sceneId: scene.id,
        startsAt: elapsed,
        duration
      };
      elapsed += duration;
      return item;
    });
  }, [scenes]);

  const projectDuration = timeline.reduce((total, item) => total + item.duration, 0);
  const activeTimelineItem = timeline.find((item) => item.sceneId === activeScene?.id);
  const activeSceneIndex = activeScene ? scenes.findIndex((scene) => scene.id === activeScene.id) : -1;
  const projectCurrentTime = (activeTimelineItem?.startsAt ?? 0) + currentTime;
  const projectProgress = projectDuration > 0 ? Math.min(100, (projectCurrentTime / projectDuration) * 100) : 0;
  const sceneProgress =
    activeVersion?.duration && activeVersion.duration > 0
      ? Math.min(100, (currentTime / activeVersion.duration) * 100)
      : 0;

  useEffect(() => {
    if (!shouldAutoPlayRef.current || !videoRef.current) {
      return;
    }

    shouldAutoPlayRef.current = false;
    videoRef.current.play().catch(() => {
      setStatusMessage("El navegador bloqueo la reproduccion automatica del siguiente clip.");
    });
  }, [activeVersion?.id]);

  function selectScene(sceneId: string, options?: { autoplay?: boolean }) {
    shouldAutoPlayRef.current = Boolean(options?.autoplay);
    setActiveSceneId(sceneId);
    setCurrentTime(0);
    setOpenMenuSceneId(null);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }

  function selectSceneByOffset(offset: -1 | 1) {
    if (activeSceneIndex < 0) {
      return;
    }

    const nextScene = scenes[activeSceneIndex + offset];

    if (nextScene) {
      selectScene(nextScene.id, { autoplay: isPlaying });
    }
  }

  function selectVersion(sceneId: string, versionId: string) {
    shouldAutoPlayRef.current = false;
    setScenes((current) =>
      current.map((scene) => (scene.id === sceneId ? { ...scene, selectedVideoId: versionId } : scene))
    );
    setActiveSceneId(sceneId);
    setCurrentTime(0);
    setOpenMenuSceneId(null);
  }

  async function toggleFavorite(sceneId: string, versionId: string) {
    const response = await fetch(`/api/videos/${versionId}/favorite`, { method: "PATCH" });

    if (!response.ok) {
      setStatusMessage("No se pudo actualizar favorito.");
      return;
    }

    const payload = (await response.json()) as { isFavorite: boolean };

    setScenes((current) =>
      current.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              versions: scene.versions.map((version) =>
                version.id === versionId ? { ...version, isFavorite: payload.isFavorite } : version
              )
            }
          : scene
      )
    );
    setStatusMessage(payload.isFavorite ? "Version agregada a favoritos." : "Version removida de favoritos.");
  }

  function moveScene(targetSceneId: string) {
    if (!draggedSceneId || draggedSceneId === targetSceneId) {
      return;
    }

    const fromIndex = scenes.findIndex((scene) => scene.id === draggedSceneId);
    const toIndex = scenes.findIndex((scene) => scene.id === targetSceneId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextScenes = [...scenes];
    const [removed] = nextScenes.splice(fromIndex, 1);
    nextScenes.splice(toIndex, 0, removed);
    setScenes(nextScenes.map((scene, index) => ({ ...scene, sortOrder: index })));
  }

  async function persistOrder(nextScenes = scenes) {
    setDraggedSceneId(null);

    const response = await fetch(`/api/projects/${initialData.project.id}/scenes/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIds: nextScenes.map((scene) => scene.id) })
    });

    setStatusMessage(response.ok ? "Orden de escenas actualizado." : "No se pudo guardar el nuevo orden.");
  }

  function playNextScene() {
    if (!activeScene) {
      return;
    }

    const index = scenes.findIndex((scene) => scene.id === activeScene.id);
    const nextScene = scenes[index + 1];

    if (nextScene) {
      selectScene(nextScene.id, { autoplay: true });
    }
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video || !activeVersion?.url) {
      return;
    }

    if (video.paused) {
      video.play().catch(() => {
        setStatusMessage("El navegador no permitio iniciar la reproduccion.");
      });
    } else {
      video.pause();
    }
  }

  function stepFrame(direction: -1 | 1) {
    const video = videoRef.current;

    if (!video || !activeVersion) {
      return;
    }

    video.pause();
    setIsPlaying(false);

    const currentFrame = secondsToFrame(video.currentTime, fps);
    const nextFrame = Math.max(0, Math.min(activeVersion.frameCount, currentFrame + direction));
    const nextTime = nextFrame / fps;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="h-full overflow-hidden">
      <aside className="fixed bottom-0 left-0 top-16 z-20 w-[340px] overflow-hidden">
        <section className="flex h-full flex-col overflow-hidden border-r border-neutral-800 bg-black text-white">
          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="text-xs font-medium uppercase text-red-300">{initialData.project.slug}</p>
            <h2 className="mt-1 text-lg font-semibold">{initialData.project.title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {activeScene ? `Escena ${activeScene.sceneNumber} · ${activeScene.location}` : "Sin escena seleccionada"}
            </p>
          </div>

          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="text-xs uppercase text-slate-500">Guion tecnico</p>
            {activeScene ? (
              <p className="mt-2 text-sm leading-6 text-slate-200">{activeScene.script.sceneText}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Selecciona una escena en la linea de tiempo.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeScene ? (
              <div className="grid gap-3">
                {activeScene.script.shots.map((shot) => (
                  <article className="border-t border-neutral-800 pt-3" key={shot.id}>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Shot {shot.shotNumber} {shot.shotType ? `· ${shot.shotType}` : ""}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{shot.description}</p>
                    {shot.action ? <p className="mt-2 text-xs leading-5 text-slate-400">Accion: {shot.action}</p> : null}
                    {shot.camera ? <p className="mt-1 text-xs leading-5 text-slate-400">Camara: {shot.camera}</p> : null}
                    {shot.sound ? <p className="mt-1 text-xs leading-5 text-slate-400">Sonido: {shot.sound}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </aside>

      <div className="ml-[340px] grid h-full w-[calc(100vw-340px)] min-w-0 grid-rows-[auto_minmax(0,1fr)_260px] overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-100 px-5 py-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Editor de secuencia</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{initialData.project.description}</p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={`/upload?projectId=${initialData.project.id}`}
            >
              Subir version
            </Link>
            {activeVersion ? (
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-900"
                href={`/review/${activeVersion.id}`}
              >
                Revisar clip
              </Link>
            ) : null}
          </div>
        </div>

        <section className="min-h-0 overflow-hidden bg-black text-white">
          <div className="border-b border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex flex-wrap items-center gap-5 text-sm">
              <div>
                <p className="text-slate-400">Clip actual</p>
                <p className="font-medium">
                  {activeScene ? `Escena ${activeScene.sceneNumber}` : "Sin escena"} · {formatDuration(currentTime, fps)} /{" "}
                  {formatDuration(activeVersion?.duration ?? 0, fps)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Secuencia completa</p>
                <p className="font-medium">
                  {formatDuration(projectCurrentTime, fps)} / {formatDuration(projectDuration, fps)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Posicion en proyecto</p>
                <p className="font-medium">
                  {formatDuration(activeTimelineItem?.startsAt ?? 0, fps)} + {formatDuration(currentTime, fps)} ·{" "}
                  {projectProgress.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-red-800" style={{ width: `${projectProgress}%` }} />
            </div>
          </div>

          <div className="grid min-h-0 place-items-center bg-black" style={{ height: "calc(100% - 142px)" }}>
            {activeVersion?.url ? (
              <video
                className="aspect-video h-full max-h-full w-full object-contain"
                key={activeVersion.id}
                onEnded={playNextScene}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                ref={videoRef}
                src={activeVersion.url}
              />
            ) : (
              <VideoPlaceholder hasVersion={Boolean(activeVersion)} sceneNumber={activeScene?.sceneNumber} />
            )}
          </div>

          <div className="border-t border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-100 hover:bg-neutral-800 disabled:opacity-40"
                  disabled={activeSceneIndex <= 0}
                  onClick={() => selectSceneByOffset(-1)}
                  type="button"
                >
                  Escena -
                </button>
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-100 hover:bg-neutral-800 disabled:opacity-40"
                  disabled={!activeVersion}
                  onClick={() => stepFrame(-1)}
                  type="button"
                >
                  Frame -
                </button>
                <button
                  className="h-9 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-40"
                  disabled={!activeVersion?.url}
                  onClick={togglePlayback}
                  type="button"
                >
                  {isPlaying ? "Pausa" : "Play"}
                </button>
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-100 hover:bg-neutral-800 disabled:opacity-40"
                  disabled={!activeVersion}
                  onClick={() => stepFrame(1)}
                  type="button"
                >
                  Frame +
                </button>
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-100 hover:bg-neutral-800 disabled:opacity-40"
                  disabled={activeSceneIndex < 0 || activeSceneIndex >= scenes.length - 1}
                  onClick={() => selectSceneByOffset(1)}
                  type="button"
                >
                  Escena +
                </button>
              </div>
              <div>
                <p className="text-sm font-medium">
                  {activeVersion
                    ? `${activeVersion.stage} v${activeVersion.versionNumber} · ${activeVersion.resolution}`
                    : "Sin version seleccionada"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {activeVersion?.fileName ?? "Selecciona una escena o sube una version para comenzar."}
                </p>
              </div>
              {activeVersion && activeScene ? (
                <button
                  className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-neutral-800"
                  onClick={() => void toggleFavorite(activeScene.id, activeVersion.id)}
                  type="button"
                >
                  {activeVersion.isFavorite ? "Quitar favorito" : "Agregar favorito"}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="min-h-0 overflow-hidden border-t border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-950">Linea de tiempo</h2>
              <p className="mt-1 text-xs text-slate-500">
                El playhead avanza sobre la escena activa; al terminar un clip carga el siguiente en el mismo viewer.
              </p>
            </div>
            {statusMessage ? <p className="text-sm text-slate-600">{statusMessage}</p> : null}
          </div>

          <div className="h-[198px] overflow-x-auto overflow-y-hidden px-3 py-3">
            <div className="flex min-w-max gap-2">
              {scenes.map((scene) => {
                const version = getSelectedVersion(scene);
                const isActive = activeScene?.id === scene.id;
                const menuOpen = openMenuSceneId === scene.id;
                const localProgress = isActive ? sceneProgress : 0;

                return (
                  <div
                    className={`relative w-36 shrink-0 rounded-md border bg-white shadow-sm transition ${
                      isActive ? "border-red-900 ring-2 ring-red-950/40" : "border-slate-200 hover:border-slate-300"
                    }`}
                    draggable
                    key={scene.id}
                    onClick={() => selectScene(scene.id)}
                    onDragEnd={() => void persistOrder()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      moveScene(scene.id);
                    }}
                    onDragStart={() => setDraggedSceneId(scene.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {isActive ? (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-red-800 shadow-[0_0_0_1px_rgba(127,29,29,0.25)]"
                        style={{ left: `${localProgress}%` }}
                      >
                        <div className="-ml-1 h-2.5 w-2.5 rounded-full bg-red-800" />
                      </div>
                    ) : null}

                    <div className="h-20 rounded-t-md bg-neutral-900 p-2 text-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase leading-none text-slate-400">Escena</p>
                          <p className="mt-1 text-lg font-semibold leading-none">{scene.sceneNumber}</p>
                        </div>
                        <button
                          className="h-6 rounded bg-neutral-800 px-1.5 text-xs font-semibold leading-none hover:bg-slate-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuSceneId(menuOpen ? null : scene.id);
                          }}
                          type="button"
                        >
                          v
                        </button>
                      </div>
                      <div className="mt-3">
                        <p className="line-clamp-1 text-xs font-medium leading-4">
                          {version ? `${version.stage} v${version.versionNumber}` : "Sin clip"}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-3 text-slate-400">{formatDuration(version?.duration ?? 0, fps)}</p>
                      </div>
                    </div>

                    <div className="grid gap-1.5 p-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="line-clamp-2 text-xs font-medium leading-4 text-slate-950">{scene.title}</p>
                        {version?.isFavorite ? <span className="text-xs text-amber-500">★</span> : null}
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${isActive ? "bg-red-900" : "bg-slate-300"}`}
                          style={{ width: `${localProgress}%` }}
                        />
                      </div>
                      <p className="text-[10px] leading-3 text-slate-500">{scene.openComments} abiertos</p>
                    </div>

                    {menuOpen ? (
                      <div
                        className="absolute right-2 top-10 z-20 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Versiones</p>
                        <div className="max-h-56 overflow-y-auto">
                          {scene.versions.map((item) => (
                            <div className="grid gap-1 rounded-md p-2 hover:bg-slate-50" key={item.id}>
                              <button
                                className="text-left text-sm font-medium text-slate-950"
                                onClick={() => selectVersion(scene.id, item.id)}
                                type="button"
                              >
                                {item.stage} v{item.versionNumber} {item.isFavorite ? "★" : ""}
                              </button>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-slate-500">{item.status}</p>
                                <button
                                  className="text-xs font-medium text-red-900 hover:text-red-950"
                                  onClick={() => void toggleFavorite(scene.id, item.id)}
                                  type="button"
                                >
                                  {item.isFavorite ? "Quitar favorito" : "Favorito"}
                                </button>
                              </div>
                            </div>
                          ))}
                          {scene.versions.length === 0 ? (
                            <p className="px-2 py-3 text-sm text-slate-500">Sin versiones subidas.</p>
                          ) : null}
                        </div>
                        <Link
                          className="mt-2 block rounded-md border border-slate-200 px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          href={`/upload?projectId=${initialData.project.id}&sceneId=${scene.id}`}
                        >
                          Subir version para esta escena
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
