"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { productionStages, type ProductionStage } from "@/types/domain";

type UploadOptions = {
  projects: Array<{ id: string; title: string; fpsDefault: number }>;
  scenes: Array<{ id: string; projectId: string; sceneNumber: string; title: string }>;
};

type VideoMetadata = {
  duration: number;
  resolution: string;
  fileSizeMb: number;
};

type UploadFormProps = {
  options: UploadOptions;
  initialProjectId?: string;
  initialSceneId?: string;
};

export function UploadForm({ options, initialProjectId, initialSceneId }: UploadFormProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId ?? options.projects[0]?.id ?? "");
  const [sceneId, setSceneId] = useState(initialSceneId ?? "");
  const [stage, setStage] = useState<ProductionStage>("animation");
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = options.projects.find((project) => project.id === projectId);
  const scenes = useMemo(
    () => options.scenes.filter((scene) => scene.projectId === projectId),
    [options.scenes, projectId]
  );
  async function handleFile(nextFile: File) {
    setError("");
    setStatus("");
    setMetadata(null);

    if (!nextFile.name.toLowerCase().endsWith(".mp4") || nextFile.type !== "video/mp4") {
      setFile(null);
      setError(
        "Este sistema acepta videos comprimidos para revision web en formato MP4 H.264. Por favor exporta nuevamente el archivo con el estandar definido para el proyecto."
      );
      return;
    }

    const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);
    const fileSizeMb = Number((nextFile.size / 1024 / 1024).toFixed(2));

    if (fileSizeMb > maxMb) {
      setFile(null);
      setError(`El archivo supera el maximo configurado de ${maxMb} MB.`);
      return;
    }

    const objectUrl = URL.createObjectURL(nextFile);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer la metadata del video."));
    }).finally(() => URL.revokeObjectURL(objectUrl));

    setFile(nextFile);
    setMetadata({
      duration: Number(video.duration.toFixed(3)),
      resolution: `${video.videoWidth}x${video.videoHeight}`,
      fileSizeMb
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!file || !metadata || !selectedProject) {
      setError("Selecciona un archivo MP4 valido antes de subir.");
      return;
    }

    if (!projectId || !sceneId || !stage) {
      setError("Proyecto, escena y etapa son obligatorios.");
      return;
    }

    setIsUploading(true);

    try {
      setStatus("Preparando URL segura...");
      const initResponse = await fetch("/api/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId,
          scope: "scene",
          stage,
          fileName: file.name,
          mimeType: file.type,
          fileSizeMb: metadata.fileSizeMb,
          duration: metadata.duration,
          fps: selectedProject.fpsDefault,
          resolution: metadata.resolution,
          notes
        })
      });

      if (!initResponse.ok) {
        const payload = await initResponse.json();
        throw new Error(payload.error ?? "No se pudo iniciar la subida.");
      }

      const initPayload = await initResponse.json();

      setStatus("Subiendo archivo a S3...");
      const uploadResponse = await fetch(initPayload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rechazo la subida del archivo.");
      }

      setStatus("Confirmando version...");
      const completeResponse = await fetch(`/api/uploads/${initPayload.uploadId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploaded: true,
          etag: uploadResponse.headers.get("etag") ?? undefined
        })
      });

      if (!completeResponse.ok) {
        const payload = await completeResponse.json();
        throw new Error(payload.error ?? "No se pudo confirmar la subida.");
      }

      setStatus(`Version v${initPayload.versionNumber} lista para revision.`);
      setFile(null);
      setMetadata(null);
      setNotes("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error inesperado al subir.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleCancel() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/projects");
  }

  return (
    <form className="grid gap-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          Proyecto
          <select
            className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
            onChange={(event) => {
              setProjectId(event.target.value);
              setSceneId("");
            }}
            value={projectId}
          >
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          Escena
          <select
            className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
            onChange={(event) => {
              setSceneId(event.target.value);
            }}
            value={sceneId}
          >
            <option value="">Seleccionar escena</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                Escena {scene.sceneNumber} - {scene.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          Etapa
          <select
            className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
            onChange={(event) => setStage(event.target.value as ProductionStage)}
            value={stage}
          >
            {productionStages.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="rounded-lg border-2 border-dashed border-neutral-700 bg-black px-6 py-10 text-center transition hover:border-red-800 hover:bg-neutral-900"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const droppedFile = event.dataTransfer.files[0];
          if (droppedFile) {
            void handleFile(droppedFile);
          }
        }}
        type="button"
      >
        <span className="block font-medium text-slate-100">
          {file ? file.name : "Arrastra aqui tu video comprimido"}
        </span>
        <span className="mt-2 block text-sm text-slate-400">Formato obligatorio: .mp4 / H.264 / CFR</span>
      </button>
      <input
        accept="video/mp4"
        className="hidden"
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (selectedFile) {
            void handleFile(selectedFile);
          }
        }}
        ref={fileInputRef}
        type="file"
      />

      {metadata ? (
        <div className="grid gap-3 rounded-md bg-black p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-500">Duracion</p>
            <p className="font-medium text-slate-100">{metadata.duration}s</p>
          </div>
          <div>
            <p className="text-slate-500">FPS</p>
            <p className="font-medium text-slate-100">{selectedProject?.fpsDefault ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Resolucion</p>
            <p className="font-medium text-slate-100">{metadata.resolution}</p>
          </div>
          <div>
            <p className="text-slate-500">Peso</p>
            <p className="font-medium text-slate-100">{metadata.fileSizeMb} MB</p>
          </div>
        </div>
      ) : null}

      <label className="grid gap-2 text-sm font-medium text-slate-300">
        Notas de entrega
        <textarea
          className="min-h-28 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Se corrige timing y acting..."
          value={notes}
        />
      </label>

      {error ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
      {status ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{status}</p> : null}

      <div className="flex justify-end gap-3">
        <button
          className="h-11 rounded-md border border-neutral-700 px-5 text-sm font-medium text-slate-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isUploading}
          onClick={handleCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="h-11 rounded-md bg-red-900 px-5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isUploading}
          type="submit"
        >
          {isUploading ? "Subiendo..." : "Subir version"}
        </button>
      </div>
    </form>
  );
}
