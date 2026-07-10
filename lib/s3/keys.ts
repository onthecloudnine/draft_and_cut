import type { ProductionStage, VideoScope } from "@/types/domain";

type BuildVideoKeyInput = {
  projectSlug: string;
  sceneNumber: string;
  shotNumber?: string | null;
  scope: VideoScope;
  stage: ProductionStage;
  versionNumber: number;
  // Cuando el media del plano es una imagen (no un video) se conserva su
  // extensión original en la clave. Por defecto se asume mp4.
  fileName?: string | null;
  mimeType?: string | null;
};

function padNumber(value: string) {
  return value.padStart(3, "0");
}

function fileExtension(fileName: string, fallback: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : fallback;
}

function cleanFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildVideoS3Key(input: BuildVideoKeyInput) {
  const isImage = (input.mimeType ?? "").startsWith("image/");
  const ext = isImage ? fileExtension(input.fileName ?? "", "jpg") : "mp4";
  const version = `v${String(input.versionNumber).padStart(3, "0")}.${ext}`;
  const sceneNumber = padNumber(input.sceneNumber);

  if (input.scope === "shot") {
    if (!input.shotNumber) {
      throw new Error("shotNumber is required for shot scoped videos");
    }

    return `projects/${input.projectSlug}/scenes/${sceneNumber}/shots/${padNumber(input.shotNumber)}/${input.stage}/${version}`;
  }

  return `projects/${input.projectSlug}/scenes/${sceneNumber}/full/${input.stage}/${version}`;
}

export function buildVideoThumbnailS3Key(input: BuildVideoKeyInput) {
  const version = `v${String(input.versionNumber).padStart(3, "0")}.thumb.jpg`;
  const sceneNumber = padNumber(input.sceneNumber);

  if (input.scope === "shot") {
    if (!input.shotNumber) {
      throw new Error("shotNumber is required for shot scoped videos");
    }

    return `projects/${input.projectSlug}/scenes/${sceneNumber}/shots/${padNumber(input.shotNumber)}/${input.stage}/${version}`;
  }

  return `projects/${input.projectSlug}/scenes/${sceneNumber}/full/${input.stage}/${version}`;
}

export function deriveThumbnailKeyFromVideoKey(videoKey: string) {
  if (videoKey.endsWith(".mp4")) {
    return `${videoKey.slice(0, -".mp4".length)}.thumb.jpg`;
  }

  return `${videoKey}.thumb.jpg`;
}

export function buildStoryboardFrameS3Key(input: {
  projectSlug: string;
  sceneNumber: string;
  shotNumber: string;
  versionNumber: number;
  fileName: string;
}) {
  const ext = fileExtension(input.fileName, "png");
  const version = `v${String(input.versionNumber).padStart(3, "0")}.${ext}`;

  return `projects/${input.projectSlug}/scenes/${padNumber(input.sceneNumber)}/shots/${padNumber(input.shotNumber)}/storyboard/${version}`;
}

export function buildArtReferenceS3Key(input: {
  projectSlug: string;
  sceneNumber: string;
  shotNumber: string;
  versionNumber: number;
  uploadId: string;
  fileName: string;
}) {
  const ext = fileExtension(input.fileName, "jpg");
  const version = `v${String(input.versionNumber).padStart(3, "0")}`;

  return `projects/${input.projectSlug}/scenes/${padNumber(input.sceneNumber)}/shots/${padNumber(input.shotNumber)}/art-refs/${version}/${input.uploadId}.${ext}`;
}

export function buildSceneAudioS3Key(input: {
  projectSlug: string;
  sceneNumber: string;
  stem: string;
  versionNumber: number;
  fileName: string;
}) {
  const ext = fileExtension(input.fileName, "mp3");
  const version = `v${String(input.versionNumber).padStart(3, "0")}.${ext}`;

  return `projects/${input.projectSlug}/scenes/${padNumber(input.sceneNumber)}/audio/${input.stem}/${version}`;
}

export function buildSceneAttachmentS3Key(input: {
  projectSlug: string;
  sceneNumber: string;
  uploadId: string;
  fileName: string;
}) {
  const sceneNumber = padNumber(input.sceneNumber);
  const fileName = cleanFileName(input.fileName) || "archivo";

  return `projects/${input.projectSlug}/scenes/${sceneNumber}/attachments/${input.uploadId}-${fileName}`;
}
