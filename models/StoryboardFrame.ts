import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const storyboardFrameSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", required: true, index: true },
    versionNumber: { type: Number, required: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true, unique: true },
    thumbnailKey: { type: String, default: null },
    mimeType: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploadId: { type: String, required: true, unique: true },
    etag: { type: String },
    status: { type: String, enum: ["uploading", "ready", "failed"], default: "uploading", index: true }
  },
  { timestamps: true }
);

storyboardFrameSchema.index({ shotId: 1, versionNumber: 1 }, { unique: true });

export type StoryboardFrameDocument = InferSchemaType<typeof storyboardFrameSchema>;

export const StoryboardFrame =
  (models.StoryboardFrame as Model<StoryboardFrameDocument> | undefined) ||
  model<StoryboardFrameDocument>("StoryboardFrame", storyboardFrameSchema);
