import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { soundStems } from "@/types/domain";

const audioVersionSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    // Scene-scoped for now; reserved for future per-shot audio.
    scope: { type: String, enum: ["scene"], default: "scene" },
    stem: { type: String, enum: soundStems, required: true, index: true },
    versionNumber: { type: Number, required: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    duration: { type: Number, required: true },
    fileSizeMb: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploadId: { type: String, required: true, unique: true },
    etag: { type: String },
    status: { type: String, enum: ["uploading", "ready", "failed"], default: "uploading", index: true }
  },
  { timestamps: true }
);

audioVersionSchema.index({ sceneId: 1, stem: 1, versionNumber: 1 }, { unique: true });

export type AudioVersionDocument = InferSchemaType<typeof audioVersionSchema>;

export const AudioVersion =
  (models.AudioVersion as Model<AudioVersionDocument> | undefined) ||
  model<AudioVersionDocument>("AudioVersion", audioVersionSchema);
