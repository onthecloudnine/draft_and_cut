import type { ProductionStage } from "@/types/domain";

// The 4 production phases that drive the scene view. Each phase fills the
// scene's shot sequence with a different kind of media.
export type PhaseId = "storyboard" | "animatic" | "playblast" | "render";

// Phases that hold per-shot video, mapped to the granular productionStages
// they group (the sub-selector inside each phase).
export const PHASE_STAGES: Record<"playblast" | "render", ProductionStage[]> = {
  playblast: ["layout", "blocking", "animation"],
  render: ["lighting", "render", "final"]
};

export type StoryboardFrameData = {
  id: string;
  shotId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt?: string;
  url: string | null;
};

export type AudioVersionData = {
  id: string;
  stem: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  duration: number;
  createdAt?: string;
  url: string | null;
};
