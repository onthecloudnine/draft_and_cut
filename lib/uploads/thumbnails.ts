// Miniaturas generadas en el navegador: se extrae un frame con <video> + <canvas>
// y se sube sólo el JPEG (~20 KB). No requiere ffmpeg en el servidor ni volver a
// subir el video.
//
// Dos caminos:
//  - desde un File local (al subir): no toca la red ni depende de CORS.
//  - desde una URL firmada de S3 (backfill de lo ya subido): requiere que el
//    bucket tenga CORS, si no el canvas queda "tainted" y toBlob() falla.

const MAX_WIDTH = 640;
const JPEG_QUALITY = 0.8;
const CAPTURE_TIMEOUT_MS = 15_000;

// Frame representativo: ~1/3 del clip, acotado para que funcione también en
// clips muy cortos (el teaser tiene planos de 7 frames).
function pickSeekTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0.1;
  return Math.min(Math.max(duration - 0.2, 0.1), Math.max(3, duration * 0.33));
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), CAPTURE_TIMEOUT_MS)
    )
  ]);
}

function drawToJpeg(source: CanvasImageSource, width: number, height: number) {
  const ratio = width > 0 ? Math.min(1, MAX_WIDTH / width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY)
  );
}

async function captureFromVideoElement(video: HTMLVideoElement) {
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("metadata"));
    })
  );
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek"));
      video.currentTime = pickSeekTime(video.duration);
    })
  );
  return drawToJpeg(video, video.videoWidth, video.videoHeight);
}

export async function captureFrameFromUrl(url: string): Promise<Blob | null> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    return await captureFromVideoElement(video);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function captureFrameFromVideoFile(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    return await captureFromVideoElement(video);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Cuando el media del plano ya es una imagen, la miniatura es la propia imagen
// reescalada.
export async function captureThumbnailFromImageFile(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = objectUrl;

  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image"));
      })
    );
    return await drawToJpeg(image, image.naturalWidth, image.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Miniatura de cualquier media local, sea video o imagen.
export function captureThumbnailFromFile(file: File): Promise<Blob | null> {
  return file.type.startsWith("image/")
    ? captureThumbnailFromImageFile(file)
    : captureFrameFromVideoFile(file);
}

export async function putThumbnail(
  blob: Blob,
  uploadUrl: string,
  uploadHeaders?: Record<string, string>
): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", ...(uploadHeaders ?? {}) },
      body: blob
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Backfill de una versión ya subida que quedó sin miniatura: captura el frame
// desde su URL firmada y sube sólo el JPEG. Devuelve un objectURL para mostrarlo
// de inmediato, o null si no se pudo (siempre best-effort).
export async function backfillVideoThumbnail(
  videoVersionId: string,
  videoUrl: string
): Promise<string | null> {
  try {
    const blob = await captureFrameFromUrl(videoUrl);
    if (!blob) return null;

    const initResponse = await fetch(`/api/videos/${videoVersionId}/thumbnail`, { method: "POST" });
    if (!initResponse.ok) return null;
    const init = (await initResponse.json()) as {
      thumbnailKey: string;
      uploadUrl: string;
      uploadHeaders?: Record<string, string>;
    };

    if (!(await putThumbnail(blob, init.uploadUrl, init.uploadHeaders))) return null;

    const confirm = await fetch(`/api/videos/${videoVersionId}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnailKey: init.thumbnailKey })
    });
    if (!confirm.ok) return null;

    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
