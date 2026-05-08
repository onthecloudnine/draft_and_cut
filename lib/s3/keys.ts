import type { ProductionStage, VideoScope } from "@/types/domain";

type BuildVideoKeyInput = {
  projectSlug: string;
  sceneNumber: string;
  shotNumber?: string | null;
  scope: VideoScope;
  stage: ProductionStage;
  versionNumber: number;
};

function padNumber(value: string) {
  return value.padStart(3, "0");
}

function cleanFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildVideoS3Key(input: BuildVideoKeyInput) {
  const version = `v${String(input.versionNumber).padStart(3, "0")}.mp4`;
  const sceneNumber = padNumber(input.sceneNumber);

  if (input.scope === "shot") {
    if (!input.shotNumber) {
      throw new Error("shotNumber is required for shot scoped videos");
    }

    return `projects/${input.projectSlug}/scenes/${sceneNumber}/shots/${padNumber(input.shotNumber)}/${input.stage}/${version}`;
  }

  return `projects/${input.projectSlug}/scenes/${sceneNumber}/full/${input.stage}/${version}`;
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
