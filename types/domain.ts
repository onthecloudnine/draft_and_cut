export const userRoles = [
  "admin",
  "director",
  "producer",
  "animator",
  "external_reviewer",
  "read_only"
] as const;

export const accountRoles = ["user", "admin"] as const;

export const videoScopes = ["scene", "shot"] as const;

export const productionStages = [
  "animatic",
  "layout",
  "blocking",
  "animation",
  "lighting",
  "render",
  "final"
] as const;

export const videoStatuses = [
  "draft",
  "uploading",
  "ready_for_review",
  "approved",
  "rejected",
  "archived",
  "failed"
] as const;

export const scriptStatuses = ["draft", "active", "superseded", "locked", "archived"] as const;

export const sceneStatuses = ["draft", "in_progress", "in_review", "approved", "archived"] as const;

export const shotStatuses = ["animatic", "playblast", "render"] as const;

export const commentStatuses = [
  "open",
  "in_progress",
  "needs_review",
  "resolved",
  "rejected",
  "archived"
] as const;

export const commentPriorities = ["low", "medium", "high", "critical"] as const;

export type UserRole = (typeof userRoles)[number];
export type AccountRole = (typeof accountRoles)[number];
export type VideoScope = (typeof videoScopes)[number];
export type ProductionStage = (typeof productionStages)[number];
export type VideoStatus = (typeof videoStatuses)[number];
export type ScriptStatus = (typeof scriptStatuses)[number];
export type SceneStatus = (typeof sceneStatuses)[number];
export type ShotStatus = (typeof shotStatuses)[number];
export type CommentStatus = (typeof commentStatuses)[number];
export type CommentPriority = (typeof commentPriorities)[number];

export type Permission =
  | "project:read"
  | "project:manage"
  | "script:manage"
  | "video:upload"
  | "video:review"
  | "video:approve"
  | "comment:create"
  | "comment:resolve"
  | "report:read";
