import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { productionStages, videoScopes, videoStatuses } from "@/types/domain";

const videoVersionSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", index: true },
    scope: { type: String, enum: videoScopes, required: true },
    versionNumber: { type: Number, required: true },
    stage: { type: String, enum: productionStages, required: true },
    status: { type: String, enum: videoStatuses, default: "uploading" },
    source: { type: String, default: "web_upload" },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    mimeType: { type: String, required: true },
    duration: { type: Number, required: true },
    fps: { type: Number, required: true },
    frameCount: { type: Number, required: true },
    resolution: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, default: "" },
    isFavorite: { type: Boolean, default: false, index: true },
    scriptVersionId: { type: Schema.Types.ObjectId, ref: "ScriptVersion" },
    uploadId: { type: String, required: true, unique: true },
    etag: { type: String },
    thumbnailKey: { type: String, default: null }
  },
  { timestamps: true }
);

videoVersionSchema.index(
  { projectId: 1, sceneId: 1, shotId: 1, scope: 1, stage: 1, versionNumber: 1 },
  { unique: true }
);

export type VideoVersionDocument = InferSchemaType<typeof videoVersionSchema>;

export const VideoVersion =
  (models.VideoVersion as Model<VideoVersionDocument> | undefined) ||
  model<VideoVersionDocument>("VideoVersion", videoVersionSchema);
