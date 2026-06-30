import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const artReferenceImageSchema = new Schema(
  {
    s3Key: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSizeMb: { type: Number },
    status: { type: String, enum: ["uploading", "ready"], default: "uploading" },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Una galería de referencias de arte por plano. Cada galería es una versión y
// contiene una o más imágenes embebidas.
const artReferenceSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", required: true, index: true },
    versionNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    images: { type: [artReferenceImageSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

artReferenceSchema.index({ shotId: 1, versionNumber: 1 }, { unique: true });

export type ArtReferenceDocument = InferSchemaType<typeof artReferenceSchema>;

export const ArtReference =
  (models.ArtReference as Model<ArtReferenceDocument> | undefined) ||
  model<ArtReferenceDocument>("ArtReference", artReferenceSchema);
