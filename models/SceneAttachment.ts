import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const sceneAttachmentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    attachmentDate: { type: Date, required: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploadId: { type: String, required: true, unique: true },
    etag: { type: String },
    status: { type: String, enum: ["uploading", "ready", "failed"], default: "uploading", index: true }
  },
  { timestamps: true }
);

sceneAttachmentSchema.index({ sceneId: 1, attachmentDate: -1 });

export type SceneAttachmentDocument = InferSchemaType<typeof sceneAttachmentSchema>;

export const SceneAttachment =
  (models.SceneAttachment as Model<SceneAttachmentDocument> | undefined) ||
  model<SceneAttachmentDocument>("SceneAttachment", sceneAttachmentSchema);
