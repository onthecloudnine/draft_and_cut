// Client-side helpers to upload media via the presigned-PUT flow:
// init (create record + signed URL) -> PUT to S3 -> complete (mark ready).
// Mirrors the flow in app/(app)/upload/upload-form.tsx, generalized for the
// per-shot video, storyboard image and scene audio endpoints.

import { captureThumbnailFromFile, putThumbnail } from "@/lib/uploads/thumbnails";

export type VideoFileMetadata = {
  duration: number;
  resolution: string;
  fileSizeMb: number;
};

// /api/uploads/init ya reserva un thumbnailKey y devuelve una URL firmada para
// subirlo. Extraemos el frame del File local (sin red, sin ffmpeg) y lo subimos;
// si falla, se completa con thumbnailUploaded:false y el servidor limpia la clave.
async function uploadThumbnailForFile(
  file: File,
  uploadUrl: string | undefined,
  uploadHeaders: Record<string, string> | undefined
): Promise<boolean> {
  if (!uploadUrl) return false;
  const blob = await captureThumbnailFromFile(file);
  if (!blob) return false;
  return putThumbnail(blob, uploadUrl, uploadHeaders);
}

function fileSizeMb(file: File) {
  return Number((file.size / 1024 / 1024).toFixed(2));
}

export async function readVideoMetadata(file: File): Promise<VideoFileMetadata> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video"));
    });
    return {
      duration: Number(video.duration.toFixed(3)),
      resolution: `${video.videoWidth}x${video.videoHeight}`,
      fileSizeMb: fileSizeMb(file)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readImageResolution(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo leer la imagen"));
    });
    return `${image.naturalWidth}x${image.naturalHeight}`;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readAudioDuration(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("No se pudo leer el audio"));
    });
    return Number(audio.duration.toFixed(3));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Error en la solicitud");
  }
  return payload;
}

async function putToS3(file: File, uploadUrl: string, uploadHeaders: Record<string, string> | undefined) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type, ...(uploadHeaders ?? {}) },
    body: file
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`S3 rechazó la subida (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.headers.get("etag") ?? undefined;
}

export type ShotVideoUploadResult = {
  versionNumber: number;
  videoVersionId: string;
  objectUrl: string;
};

export async function uploadShotVideo(input: {
  projectId: string;
  sceneId: string;
  shotId: string;
  stage: string;
  fps: number;
  file: File;
}): Promise<ShotVideoUploadResult> {
  const metadata = await readVideoMetadata(input.file);
  const init = await postJson("/api/uploads/init", {
    projectId: input.projectId,
    sceneId: input.sceneId,
    scope: "shot",
    shotId: input.shotId,
    stage: input.stage,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSizeMb: metadata.fileSizeMb,
    duration: metadata.duration,
    fps: input.fps,
    resolution: metadata.resolution
  });
  const etag = await putToS3(input.file, init.uploadUrl, init.uploadHeaders);
  const thumbnailUploaded = await uploadThumbnailForFile(
    input.file,
    init.thumbnailUploadUrl,
    init.thumbnailUploadHeaders
  );
  await postJson(`/api/uploads/${init.uploadId}/complete`, {
    uploaded: true,
    etag,
    thumbnailUploaded
  });
  return {
    versionNumber: init.versionNumber,
    videoVersionId: init.videoVersionId,
    objectUrl: URL.createObjectURL(input.file)
  };
}

export type ShotMediaUploadResult = ShotVideoUploadResult & {
  mimeType: string;
  isImage: boolean;
  duration: number;
  resolution: string;
};

// Sube el media de un plano, indistintamente video (mp4) o imagen. Para imágenes
// no hay duración/fps de video; la duración en el reproductor se toma del rango
// de frames del plano.
export async function uploadShotMedia(input: {
  projectId: string;
  sceneId: string;
  shotId: string;
  stage: string;
  fps: number;
  file: File;
}): Promise<ShotMediaUploadResult> {
  const isImage = input.file.type.startsWith("image/");
  let duration = 0;
  let resolution = "";
  if (isImage) {
    resolution = await readImageResolution(input.file).catch(() => "");
  } else {
    const meta = await readVideoMetadata(input.file);
    duration = meta.duration;
    resolution = meta.resolution;
  }
  const init = await postJson("/api/uploads/init", {
    projectId: input.projectId,
    sceneId: input.sceneId,
    scope: "shot",
    shotId: input.shotId,
    stage: input.stage,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSizeMb: fileSizeMb(input.file),
    duration,
    fps: input.fps,
    resolution
  });
  const etag = await putToS3(input.file, init.uploadUrl, init.uploadHeaders);
  const thumbnailUploaded = await uploadThumbnailForFile(
    input.file,
    init.thumbnailUploadUrl,
    init.thumbnailUploadHeaders
  );
  await postJson(`/api/uploads/${init.uploadId}/complete`, {
    uploaded: true,
    etag,
    thumbnailUploaded
  });
  return {
    versionNumber: init.versionNumber,
    videoVersionId: init.videoVersionId,
    objectUrl: URL.createObjectURL(input.file),
    mimeType: input.file.type,
    isImage,
    duration,
    resolution
  };
}

export type StoryboardUploadResult = { versionNumber: number; objectUrl: string };

export async function uploadStoryboardImage(input: {
  sceneId: string;
  shotId: string;
  file: File;
}): Promise<StoryboardUploadResult> {
  const init = await postJson(`/api/scenes/${input.sceneId}/storyboard/init`, {
    shotId: input.shotId,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSizeMb: fileSizeMb(input.file)
  });
  const etag = await putToS3(input.file, init.uploadUrl, init.uploadHeaders);
  await postJson(`/api/scenes/${input.sceneId}/storyboard/${init.uploadId}/complete`, {
    uploaded: true,
    etag
  });
  return { versionNumber: init.versionNumber, objectUrl: URL.createObjectURL(input.file) };
}

export type AudioUploadResult = { versionNumber: number; objectUrl: string };

export async function uploadSceneAudio(input: {
  sceneId: string;
  stem: string;
  file: File;
}): Promise<AudioUploadResult> {
  const duration = await readAudioDuration(input.file);
  const init = await postJson(`/api/scenes/${input.sceneId}/audio/init`, {
    stem: input.stem,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSizeMb: fileSizeMb(input.file),
    duration
  });
  const etag = await putToS3(input.file, init.uploadUrl, init.uploadHeaders);
  await postJson(`/api/scenes/${input.sceneId}/audio/${init.uploadId}/complete`, {
    uploaded: true,
    etag
  });
  return { versionNumber: init.versionNumber, objectUrl: URL.createObjectURL(input.file) };
}

export type ArtReferenceUploadResult = {
  galleryId: string;
  versionNumber: number;
  imageId: string;
  url: string | null;
  objectUrl: string;
};

export async function uploadArtReferenceImage(input: {
  sceneId: string;
  shotId: string;
  galleryId?: string;
  file: File;
}): Promise<ArtReferenceUploadResult> {
  const init = await postJson(`/api/scenes/${input.sceneId}/art-references/init`, {
    shotId: input.shotId,
    galleryId: input.galleryId,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSizeMb: fileSizeMb(input.file)
  });
  await putToS3(input.file, init.uploadUrl, init.uploadHeaders);
  const done = await postJson(`/api/scenes/${input.sceneId}/art-references/complete`, {
    galleryId: init.galleryId,
    imageId: init.imageId,
    uploaded: true
  });
  return {
    galleryId: init.galleryId,
    versionNumber: init.versionNumber,
    imageId: init.imageId,
    url: done.image?.url ?? null,
    objectUrl: URL.createObjectURL(input.file)
  };
}
