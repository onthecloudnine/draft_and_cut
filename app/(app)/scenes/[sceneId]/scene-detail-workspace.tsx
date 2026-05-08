"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { shotStatuses, type ShotStatus } from "@/types/domain";

type SceneData = {
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
};

type ShotData = {
  id: string;
  shotNumber: string;
  shotType: string;
  status: ShotStatus;
  description: string;
  action: string;
  camera: string;
  sound: string;
  requiredElements: string[];
  productionNotes: string;
  startFrame: number | null;
  endFrame: number | null;
};

type VideoData = {
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

type AttachmentData = {
  id: string;
  title: string;
  description: string;
  attachmentDate: string;
  fileName: string;
  fileSizeMb: number;
  mimeType: string;
  uploadedByName: string;
  createdAt?: string;
  url: string | null;
};

type ProjectMemberData = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type HumanResourceData = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  assignedAt?: string;
};

type SceneDetailWorkspaceProps = {
  scene: SceneData;
  shots: ShotData[];
  videos: VideoData[];
  attachments: AttachmentData[];
  projectMembers: ProjectMemberData[];
  humanResources: HumanResourceData[];
  canEditScript: boolean;
  canManageResources: boolean;
  initialShotId?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function splitElements(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNextShotNumber(shots: ShotData[]) {
  const numericShotNumbers = shots
    .map((shot) => Number.parseInt(shot.shotNumber, 10))
    .filter(Number.isFinite);

  if (numericShotNumbers.length === 0) {
    return "1";
  }

  return String(Math.max(...numericShotNumbers) + 1);
}

function createEmptyShot(shots: ShotData[]): ShotData {
  return {
    id: `new-${crypto.randomUUID()}`,
    shotNumber: getNextShotNumber(shots),
    shotType: "",
    status: "animatic",
    description: "",
    action: "",
    camera: "",
    sound: "",
    requiredElements: [],
    productionNotes: "",
    startFrame: null,
    endFrame: null
  };
}

export function SceneDetailWorkspace({
  scene: initialScene,
  shots: initialShots,
  videos,
  attachments: initialAttachments,
  projectMembers,
  humanResources: initialHumanResources,
  canEditScript,
  canManageResources,
  initialShotId
}: SceneDetailWorkspaceProps) {
  const [scene, setScene] = useState(initialScene);
  const [shots, setShots] = useState(initialShots);
  const [activeShotId, setActiveShotId] = useState(initialShotId ?? initialShots[0]?.id ?? "");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [humanResources, setHumanResources] = useState(initialHumanResources);
  const [selectedResourceUserId, setSelectedResourceUserId] = useState("");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDate, setAttachmentDate] = useState(todayInputValue());
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [scriptStatus, setScriptStatus] = useState("");
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [resourceStatus, setResourceStatus] = useState("");
  const [error, setError] = useState("");
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;
  const availableResourceMembers = projectMembers.filter(
    (member) => !humanResources.some((resource) => resource.userId === member.id)
  );
  const shotVideos = activeShot ? videos.filter((video) => video.shotId === activeShot.id) : [];
  const sceneVideos = videos.filter((video) => video.scope === "scene" || !video.shotId);
  const availableVideos = shotVideos.length > 0 ? shotVideos : sceneVideos.length > 0 ? sceneVideos : videos;
  const activeVideo = useMemo(
    () =>
      availableVideos.find((video) => video.id === selectedVideoId) ??
      availableVideos.find((video) => video.isFavorite) ??
      availableVideos[0] ??
      null,
    [availableVideos, selectedVideoId]
  );

  function updateShot(shotId: string, patch: Partial<ShotData>) {
    setShots((current) => current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)));
  }

  function addShot() {
    const shot = createEmptyShot(shots);
    setShots((current) => [...current, shot]);
    setActiveShotId(shot.id);
    setSelectedVideoId("");
  }

  function removeShot(shotId: string) {
    if (!window.confirm("Estas seguro de quitar el plano?")) {
      return;
    }

    const nextShots = shots.filter((shot) => shot.id !== shotId);
    setShots(nextShots);

    if (activeShotId === shotId) {
      setActiveShotId(nextShots[0]?.id ?? "");
      setSelectedVideoId("");
    }
  }

  async function addHumanResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageResources || !selectedResourceUserId) {
      return;
    }

    setError("");
    setResourceStatus("");
    setIsSavingResource(true);

    try {
      const response = await fetch(`/api/scenes/${scene.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedResourceUserId })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "No se pudo asignar el responsable.");
      }

      const payload = (await response.json()) as { resource: HumanResourceData };
      setHumanResources((current) =>
        current.some((resource) => resource.id === payload.resource.id) ? current : [...current, payload.resource]
      );
      setSelectedResourceUserId("");
      setResourceStatus("Responsable asignado.");
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : "Error inesperado al asignar.");
    } finally {
      setIsSavingResource(false);
    }
  }

  async function removeHumanResource(resourceId: string) {
    if (!canManageResources) {
      return;
    }

    setError("");
    setResourceStatus("");

    const response = await fetch(`/api/scenes/${scene.id}/resources/${resourceId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "No se pudo quitar el responsable.");
      return;
    }

    setHumanResources((current) => current.filter((resource) => resource.id !== resourceId));
    setResourceStatus("Responsable removido.");
  }

  async function saveScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditScript) {
      return;
    }

    setError("");
    setScriptStatus("");
    setIsSavingScript(true);

    try {
      const response = await fetch(`/api/scenes/${scene.id}/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: {
            title: scene.title,
            description: scene.description,
            location: scene.location,
            timeOfDay: scene.timeOfDay
          },
          shots: shots.map((shot) => ({
            ...shot,
            id: shot.id.startsWith("new-") ? undefined : shot.id
          }))
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "No se pudo guardar el guion tecnico.");
      }

      const payload = (await response.json()) as { shots?: ShotData[] };

      if (payload.shots) {
        setShots(payload.shots);
        setActiveShotId((current) =>
          payload.shots?.some((shot) => shot.id === current) ? current : payload.shots?.[0]?.id ?? ""
        );
      }

      setScriptStatus("Guion tecnico actualizado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado al guardar.");
    } finally {
      setIsSavingScript(false);
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAttachmentStatus("");

    if (!attachmentFile) {
      setError("Selecciona un archivo para adjuntar.");
      return;
    }

    if (!attachmentTitle.trim()) {
      setError("Agrega un titulo para el adjunto.");
      return;
    }

    setIsUploadingAttachment(true);

    try {
      const fileSizeMb = Number((attachmentFile.size / 1024 / 1024).toFixed(2));
      const initResponse = await fetch(`/api/scenes/${scene.id}/attachments/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: attachmentTitle,
          description: attachmentDescription,
          attachmentDate: new Date(`${attachmentDate}T00:00:00`).toISOString(),
          fileName: attachmentFile.name,
          mimeType: attachmentFile.type || "application/octet-stream",
          fileSizeMb
        })
      });

      if (!initResponse.ok) {
        const payload = await initResponse.json();
        throw new Error(payload.error ?? "No se pudo preparar el adjunto.");
      }

      const initPayload = await initResponse.json();
      const uploadResponse = await fetch(initPayload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": attachmentFile.type || "application/octet-stream" },
        body: attachmentFile
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rechazo la subida del adjunto.");
      }

      const completeResponse = await fetch(`/api/scenes/${scene.id}/attachments/${initPayload.uploadId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploaded: true,
          etag: uploadResponse.headers.get("etag") ?? undefined
        })
      });

      if (!completeResponse.ok) {
        const payload = await completeResponse.json();
        throw new Error(payload.error ?? "No se pudo confirmar el adjunto.");
      }

      const completePayload = (await completeResponse.json()) as { attachment: AttachmentData };
      setAttachments((current) => [completePayload.attachment, ...current]);
      setAttachmentTitle("");
      setAttachmentDescription("");
      setAttachmentDate(todayInputValue());
      setAttachmentFile(null);
      setAttachmentStatus("Adjunto agregado a la escena.");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error inesperado al subir.");
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <section className="border-b border-neutral-800 bg-black px-5 py-4 sm:px-7">
        <Link className="text-sm font-medium text-red-300 hover:text-red-200" href={`/projects/${scene.projectId}`}>
          Volver al proyecto
        </Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Escena {scene.sceneNumber}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">{scene.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{scene.description}</p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800"
            href={`/upload?projectId=${scene.projectId}&sceneId=${scene.id}`}
          >
            Subir video
          </Link>
        </div>
      </section>

      <section className="grid gap-5 px-5 py-5 sm:px-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
          <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black shadow-lg shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 text-white">
              <div>
                <p className="text-xs uppercase text-slate-400">Video cargado</p>
                <p className="mt-1 text-sm font-medium">
                  {activeVideo
                    ? `${activeVideo.stage} v${activeVideo.versionNumber} · ${activeVideo.resolution}`
                    : "Sin video para esta seleccion"}
                </p>
              </div>
              {availableVideos.length > 1 ? (
                <select
                  className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-white"
                  onChange={(event) => setSelectedVideoId(event.target.value)}
                  value={activeVideo?.id ?? ""}
                >
                  {availableVideos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.stage} v{video.versionNumber} {video.shotId ? "(shot)" : "(escena)"}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="grid aspect-video place-items-center bg-black">
              {activeVideo?.url ? (
                <video className="h-full w-full object-contain" controls key={activeVideo.id} src={activeVideo.url} />
              ) : (
                <div className="px-6 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-neutral-700 bg-neutral-900">
                    <div className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-slate-400" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-100">Sin previsualizacion disponible</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Sube o selecciona una version lista para revision en esta escena.
                  </p>
                </div>
              )}
            </div>
          </div>

          <section className="grid gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Guion literario</h2>
              <p className="mt-1 text-sm text-slate-400">
                {scene.literaryHeading || `Escena ${scene.sceneNumber}`}
              </p>
            </div>
            {scene.literaryScript ? (
              <div className="max-h-[520px] overflow-y-auto rounded-md border border-neutral-800 bg-black p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{scene.literaryScript}</p>
              </div>
            ) : (
              <p className="rounded-md border border-neutral-800 bg-black/40 p-4 text-sm text-slate-400">
                Esta escena todavia no tiene guion literario cargado.
              </p>
            )}
          </section>

          <form className="grid gap-5 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30" onSubmit={saveScript}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Guion tecnico</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {canEditScript ? "Edicion habilitada para admin." : "Vista de solo lectura."}
                </p>
              </div>
              {canEditScript ? (
                <button
                  className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  disabled={isSavingScript}
                  type="submit"
                >
                  {isSavingScript ? "Guardando..." : "Guardar guion"}
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Titulo
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, title: event.target.value }))}
                  value={scene.title}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Locacion
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, location: event.target.value }))}
                  value={scene.location}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Momento
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, timeOfDay: event.target.value }))}
                  value={scene.timeOfDay}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                Intencion dramatica
                <textarea
                  className="min-h-24 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, description: event.target.value }))}
                  value={scene.description}
                />
              </label>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase text-slate-400">Shots</h3>
                {canEditScript ? (
                  <button
                    className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-200 hover:bg-neutral-800"
                    onClick={addShot}
                    type="button"
                  >
                    Agregar shot
                  </button>
                ) : null}
              </div>
              {shots.map((shot) => (
                <article
                  className={`rounded-lg border p-4 ${shot.id === activeShot?.id ? "border-red-900/70 bg-neutral-950" : "border-neutral-800 bg-black/40"}`}
                  key={shot.id}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <button
                      className="text-left"
                      onClick={() => {
                        setActiveShotId(shot.id);
                        setSelectedVideoId("");
                      }}
                      type="button"
                    >
                      <p className="text-xs font-semibold uppercase text-slate-500">Shot {shot.shotNumber}</p>
                      <h3 className="mt-1 font-semibold text-slate-50">{shot.shotType || "Sin tipo de shot"}</h3>
                    </button>
                    {canEditScript ? (
                      <button
                        className="rounded-md border border-red-900/70 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/30"
                        onClick={() => removeShot(shot.id)}
                        type="button"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Numero
                      <input
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { shotNumber: event.target.value })}
                        value={shot.shotNumber}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Tipo
                      <input
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { shotType: event.target.value })}
                        value={shot.shotType}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Estado
                      <select
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { status: event.target.value as ShotStatus })}
                        value={shot.status}
                      >
                        {shotStatuses.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                      Descripcion
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { description: event.target.value })}
                        value={shot.description}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Accion
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { action: event.target.value })}
                        value={shot.action}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Camara
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { camera: event.target.value })}
                        value={shot.camera}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Sonido / transicion
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { sound: event.target.value })}
                        value={shot.sound}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      Elementos necesarios
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { requiredElements: splitElements(event.target.value) })}
                        value={shot.requiredElements.join("\n")}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                      Notas de produccion
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { productionNotes: event.target.value })}
                        value={shot.productionNotes}
                      />
                    </label>
                  </div>
                </article>
              ))}
              {shots.length === 0 ? (
                <p className="rounded-md border border-neutral-800 bg-black/40 p-4 text-sm text-slate-400">
                  Sin shots en esta escena.
                </p>
              ) : null}
            </div>

            {scriptStatus ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{scriptStatus}</p> : null}
          </form>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-50">Responsables</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {canManageResources
                    ? "Asigna uno o varios responsables del proyecto a esta escena."
                    : "Responsables asignados a esta escena."}
                </p>
              </div>
            </div>

            {canManageResources ? (
              <form className="mt-4 grid gap-3" onSubmit={addHumanResource}>
                <label className="grid gap-2 text-sm font-medium text-slate-300">
                  Responsable
                  <select
                    className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:opacity-60"
                    disabled={availableResourceMembers.length === 0 || isSavingResource}
                    onChange={(event) => setSelectedResourceUserId(event.target.value)}
                    value={selectedResourceUserId}
                  >
                    <option value="">Seleccionar responsable</option>
                    {availableResourceMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  disabled={!selectedResourceUserId || isSavingResource}
                  type="submit"
                >
                  {isSavingResource ? "Asignando..." : "Asignar responsable"}
                </button>
              </form>
            ) : null}

            <div className="mt-4 grid gap-2">
              {humanResources.map((resource) => (
                <article
                  className="rounded-md border border-neutral-800 bg-black/40 p-3 text-sm"
                  key={resource.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-50">{resource.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{resource.email}</p>
                      <p className="mt-2 text-xs font-medium uppercase text-red-300">{resource.role}</p>
                    </div>
                    {canManageResources ? (
                      <button
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-neutral-800"
                        onClick={() => void removeHumanResource(resource.id)}
                        type="button"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {humanResources.length === 0 ? (
                <p className="rounded-md border border-neutral-800 bg-black/40 p-3 text-sm text-slate-400">
                  Sin responsables asignados.
                </p>
              ) : null}
            </div>

            {resourceStatus ? (
              <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                {resourceStatus}
              </p>
            ) : null}
          </section>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <h2 className="font-semibold text-slate-50">Shots</h2>
            <div className="mt-4 grid gap-2">
              {shots.map((shot) => (
                <button
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    shot.id === activeShot?.id
                      ? "border-red-900/70 bg-neutral-950 text-red-100"
                      : "border-neutral-800 bg-black/40 text-slate-300 hover:border-neutral-700"
                  }`}
                  key={shot.id}
                  onClick={() => {
                    setActiveShotId(shot.id);
                    setSelectedVideoId("");
                  }}
                  type="button"
                >
                  <span className="font-semibold">Shot {shot.shotNumber}</span>
                  {shot.shotType ? <span className="text-slate-500"> · {shot.shotType}</span> : null}
                  <span className="mt-1 block text-xs text-slate-500">{shot.status}</span>
                </button>
              ))}
            </div>
          </div>

          <form className="grid gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30" onSubmit={uploadAttachment}>
            <h2 className="font-semibold text-slate-50">Adjuntos</h2>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Titulo
              <input
                className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
                onChange={(event) => setAttachmentTitle(event.target.value)}
                value={attachmentTitle}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Fecha
              <input
                className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
                onChange={(event) => setAttachmentDate(event.target.value)}
                type="date"
                value={attachmentDate}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Descripcion
              <textarea
                className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100"
                onChange={(event) => setAttachmentDescription(event.target.value)}
                value={attachmentDescription}
              />
            </label>
            <button
              className="rounded-md border-2 border-dashed border-neutral-700 bg-black px-4 py-5 text-center text-sm text-slate-300 hover:border-red-800 hover:bg-neutral-900"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {attachmentFile ? attachmentFile.name : "Seleccionar archivo"}
            </button>
            <input
              className="hidden"
              onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              disabled={isUploadingAttachment}
              type="submit"
            >
              {isUploadingAttachment ? "Subiendo..." : "Agregar adjunto"}
            </button>
            {attachmentStatus ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{attachmentStatus}</p> : null}
          </form>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <h2 className="font-semibold text-slate-50">Lista de archivos</h2>
            <div className="mt-4 grid gap-3">
              {attachments.map((attachment) => (
                <article className="rounded-md border border-neutral-800 bg-black/40 p-3" key={attachment.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-50">{attachment.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(attachment.attachmentDate)} · {attachment.uploadedByName}
                      </p>
                    </div>
                    <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-slate-300">
                      {attachment.fileSizeMb} MB
                    </span>
                  </div>
                  {attachment.description ? (
                    <p className="mt-2 text-sm leading-5 text-slate-400">{attachment.description}</p>
                  ) : null}
                  {attachment.url ? (
                    <a
                      className="mt-3 inline-flex text-sm font-medium text-red-300 hover:text-red-200"
                      href={attachment.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir {attachment.fileName}
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{attachment.fileName}</p>
                  )}
                </article>
              ))}
              {attachments.length === 0 ? <p className="text-sm text-slate-400">Sin adjuntos en esta escena.</p> : null}
            </div>
          </div>

          {error ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
        </aside>
      </section>
    </div>
  );
}
