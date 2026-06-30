"use client";

import { useMemo, useRef, useState } from "react";
import { uploadArtReferenceImage } from "@/lib/uploads/client";

export type ArtReferenceImageData = { id: string; url: string | null; fileName: string };
export type ArtReferenceData = {
  id: string;
  shotId: string;
  versionNumber: number;
  title: string;
  images: ArtReferenceImageData[];
};

type ShotItem = { id: string; shotNumber: string };

// Panel lateral de referencias de arte por plano. Cada galería es una versión
// (v1, v2...) con una o más imágenes; se pueden crear, editar y eliminar, lo
// mismo que las imágenes individuales.
export function ArtReferencesPanel({
  scene,
  activeShot,
  galleries,
  setGalleries,
  canEdit,
  onClose,
  t
}: {
  scene: { id: string };
  activeShot: ShotItem | null;
  galleries: ArtReferenceData[];
  setGalleries: React.Dispatch<React.SetStateAction<ArtReferenceData[]>>;
  canEdit: boolean;
  onClose: () => void;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const newFileRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);

  const shotId = activeShot?.id ?? "";
  const shotGalleries = useMemo(
    () => galleries.filter((g) => g.shotId === shotId).sort((a, b) => a.versionNumber - b.versionNumber),
    [galleries, shotId]
  );
  const selected =
    shotGalleries.find((g) => g.id === selectedId) ?? shotGalleries[shotGalleries.length - 1] ?? null;

  function patchGallery(id: string, patch: Partial<ArtReferenceData>) {
    setGalleries((cur) => cur.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  async function handleNewGallery(files: FileList) {
    if (!shotId || files.length === 0) return;
    setError("");
    setBusy(true);
    let galleryId: string | undefined;
    try {
      for (const file of Array.from(files)) {
        const res = await uploadArtReferenceImage({ sceneId: scene.id, shotId, galleryId, file });
        galleryId = res.galleryId;
        setGalleries((cur) => {
          const existing = cur.find((g) => g.id === res.galleryId);
          const image = { id: res.imageId, url: res.url ?? res.objectUrl, fileName: file.name };
          if (existing) {
            return cur.map((g) => (g.id === res.galleryId ? { ...g, images: [...g.images, image] } : g));
          }
          return [
            ...cur,
            { id: res.galleryId, shotId, versionNumber: res.versionNumber, title: "", images: [image] }
          ];
        });
      }
      if (galleryId) setSelectedId(galleryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setBusy(false);
      if (newFileRef.current) newFileRef.current.value = "";
    }
  }

  async function handleAddImages(galleryId: string, files: FileList) {
    if (!shotId || files.length === 0) return;
    setError("");
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadArtReferenceImage({ sceneId: scene.id, shotId, galleryId, file });
        const image = { id: res.imageId, url: res.url ?? res.objectUrl, fileName: file.name };
        setGalleries((cur) =>
          cur.map((g) => (g.id === galleryId ? { ...g, images: [...g.images, image] } : g))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setBusy(false);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  }

  async function deleteImage(galleryId: string, imageId: string) {
    if (!canEdit) return;
    setError("");
    try {
      const res = await fetch(`/api/scenes/${scene.id}/art-references/${galleryId}/images/${imageId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      const payload = (await res.json()) as { galleryDeleted?: boolean };
      if (payload.galleryDeleted) {
        setGalleries((cur) => cur.filter((g) => g.id !== galleryId));
      } else {
        setGalleries((cur) =>
          cur.map((g) => (g.id === galleryId ? { ...g, images: g.images.filter((im) => im.id !== imageId) } : g))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function deleteGallery(galleryId: string) {
    if (!canEdit) return;
    if (!window.confirm(t("scene.artDeleteGalleryConfirm"))) return;
    setError("");
    try {
      const res = await fetch(`/api/scenes/${scene.id}/art-references/${galleryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      setGalleries((cur) => cur.filter((g) => g.id !== galleryId));
      setSelectedId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function saveTitle(galleryId: string, title: string) {
    if (!canEdit) return;
    patchGallery(galleryId, { title });
    try {
      await fetch(`/api/scenes/${scene.id}/art-references/${galleryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
    } catch {
      /* el optimista ya se aplicó */
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-surface xl:w-80">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="truncate text-[12px] font-semibold text-fg-strong">
          {t("scene.artReferences")}
          {activeShot ? <span className="text-muted"> · {t("scene.shotShort")} {activeShot.shotNumber}</span> : null}
        </span>
        <button
          aria-label={t("scene.artHide")}
          className="rounded p-0.5 text-muted hover:bg-elevated hover:text-fg"
          onClick={onClose}
          type="button"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {!activeShot ? (
        <div className="p-4 text-xs text-muted">{t("scene.phaseNoShot")}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
            {shotGalleries.map((g) => (
              <button
                className={[
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                  selected?.id === g.id
                    ? "border-red-500 bg-red-600/10 text-fg-strong"
                    : "border-line bg-background text-muted hover:bg-elevated"
                ].join(" ")}
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                type="button"
              >
                v{g.versionNumber}
              </button>
            ))}
            {canEdit ? (
              <button
                className="rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-medium text-muted-strong hover:bg-elevated disabled:opacity-60"
                disabled={busy}
                onClick={() => newFileRef.current?.click()}
                type="button"
              >
                + {t("scene.artNewGallery")}
              </button>
            ) : null}
          </div>

          {selected ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {canEdit ? (
                <input
                  className="mb-2 h-7 w-full rounded border border-line bg-background px-2 text-[11px] text-fg"
                  defaultValue={selected.title}
                  key={selected.id}
                  onBlur={(e) => {
                    if (e.target.value !== selected.title) void saveTitle(selected.id, e.target.value);
                  }}
                  placeholder={t("scene.artTitlePlaceholder")}
                />
              ) : selected.title ? (
                <p className="mb-2 text-[11px] font-medium text-fg">{selected.title}</p>
              ) : null}

              <div className="grid gap-2">
                {selected.images.map((image) => (
                  <div className="group relative overflow-hidden rounded-md border border-line bg-background" key={image.id}>
                    {image.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={image.fileName} className="w-full object-contain" src={image.url} />
                    ) : (
                      <div className="flex h-24 items-center justify-center text-[10px] text-muted">{image.fileName}</div>
                    )}
                    {canEdit ? (
                      <button
                        aria-label={t("scene.artDeleteImage")}
                        className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-danger"
                        onClick={() => void deleteImage(selected.id, image.id)}
                        type="button"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                ))}
                {selected.images.length === 0 ? (
                  <p className="py-6 text-center text-[11px] text-muted">{t("scene.artEmptyGallery")}</p>
                ) : null}
              </div>

              {canEdit ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="flex-1 rounded-md border border-line-strong px-2 py-1.5 text-[11px] font-medium text-muted-strong hover:bg-elevated disabled:opacity-60"
                    disabled={busy}
                    onClick={() => addFileRef.current?.click()}
                    type="button"
                  >
                    {busy ? t("scene.phaseUploadBusy") : `+ ${t("scene.artAddImages")}`}
                  </button>
                  <button
                    className="rounded-md border border-danger px-2 py-1.5 text-[11px] font-medium text-danger-fg hover:bg-danger-soft"
                    onClick={() => void deleteGallery(selected.id)}
                    type="button"
                  >
                    {t("scene.artDeleteGallery")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-[11px] text-muted">
              {t("scene.artNoGalleries")}
            </div>
          )}

          {error ? <p className="shrink-0 border-t border-line p-2 text-[10px] text-danger-fg">{error}</p> : null}
        </div>
      )}

      <input
        accept="image/*"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) void handleNewGallery(e.target.files);
        }}
        ref={newFileRef}
        type="file"
      />
      <input
        accept="image/*"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && selected) void handleAddImages(selected.id, e.target.files);
        }}
        ref={addFileRef}
        type="file"
      />
    </aside>
  );
}
