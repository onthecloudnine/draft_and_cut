import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { scriptStatuses } from "@/types/domain";

const scriptVersionSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    versionNumber: { type: Number, required: true },
    status: { type: String, enum: scriptStatuses, default: "draft" },
    source: { type: String, default: "manual" },
    changeSummary: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

scriptVersionSchema.index({ projectId: 1, versionNumber: 1 }, { unique: true });

export type ScriptVersionDocument = InferSchemaType<typeof scriptVersionSchema>;

export const ScriptVersion =
  (models.ScriptVersion as Model<ScriptVersionDocument> | undefined) ||
  model<ScriptVersionDocument>("ScriptVersion", scriptVersionSchema);
