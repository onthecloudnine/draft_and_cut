import options from "@/config/options.json";

function nonEmptyOptionList(value: string[], key: string) {
  if (value.length === 0) {
    throw new Error(`Option list ${key} must not be empty`);
  }

  return value as [string, ...string[]];
}

export const userRoles = nonEmptyOptionList(options.userRoles, "userRoles");
export const accountRoles = nonEmptyOptionList(options.accountRoles, "accountRoles");
export const videoScopes = nonEmptyOptionList(options.videoScopes, "videoScopes");
export const productionStages = nonEmptyOptionList(options.productionStages, "productionStages");
export const videoStatuses = nonEmptyOptionList(options.videoStatuses, "videoStatuses");
export const scriptStatuses = nonEmptyOptionList(options.scriptStatuses, "scriptStatuses");
export const sceneStatuses = nonEmptyOptionList(options.sceneStatuses, "sceneStatuses");
export const sceneSoundOptions = nonEmptyOptionList(options.sceneSoundOptions, "sceneSoundOptions");
export const assetTagCategories = nonEmptyOptionList(options.assetTagCategories, "assetTagCategories");
export const shotStatuses = nonEmptyOptionList(options.shotStatuses, "shotStatuses");
export const commentStatuses = nonEmptyOptionList(options.commentStatuses, "commentStatuses");
export const commentPriorities = nonEmptyOptionList(options.commentPriorities, "commentPriorities");

export type UserRole = string;
export type AccountRole = string;
export type VideoScope = string;
export type ProductionStage = string;
export type VideoStatus = string;
export type ScriptStatus = string;
export type SceneStatus = string;
export type SceneSoundOption = string;
export type AssetTagCategory = string;
export type ShotStatus = string;
export type CommentStatus = string;
export type CommentPriority = string;

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
