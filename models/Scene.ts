import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { sceneSoundOptions, sceneStatuses } from "@/types/domain";

const sceneSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    literaryHeading: { type: String, default: "" },
    literaryScript: { type: String, default: "" },
    location: { type: String, default: "" },
    timeOfDay: { type: String, default: "" },
    soundOptions: { type: [String], enum: sceneSoundOptions, default: ["none"] },
    sortOrder: { type: Number, default: 0, index: true },
    status: { type: String, enum: sceneStatuses, default: "draft" },
    currentVideoVersionId: { type: Schema.Types.ObjectId, ref: "VideoVersion" },
    currentScriptVersionId: { type: Schema.Types.ObjectId, ref: "ScriptVersion" }
  },
  { timestamps: true }
);

sceneSchema.index({ projectId: 1, sceneNumber: 1 }, { unique: true });
sceneSchema.index({ projectId: 1, sortOrder: 1 });

export type SceneDocument = InferSchemaType<typeof sceneSchema>;

export const Scene =
  (models.Scene as Model<SceneDocument> | undefined) || model<SceneDocument>("Scene", sceneSchema);
