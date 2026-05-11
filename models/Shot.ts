import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { shotStatuses } from "@/types/domain";

const shotSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    scriptVersionId: { type: Schema.Types.ObjectId, ref: "ScriptVersion", required: true, index: true },
    sceneNumber: { type: String, required: true, trim: true },
    shotNumber: { type: String, required: true, trim: true },
    shotType: { type: String, default: "" },
    status: { type: String, enum: shotStatuses, default: "animatic", index: true },
    description: { type: String, default: "" },
    action: { type: String, default: "" },
    camera: { type: String, default: "" },
    sound: { type: String, default: "" },
    requiredElements: [{ type: String }],
    productionNotes: { type: String, default: "" },
    durationFrames: { type: Number },
    startFrame: { type: Number },
    endFrame: { type: Number }
  },
  { timestamps: true }
);

shotSchema.index({ scriptVersionId: 1, sceneNumber: 1, shotNumber: 1 }, { unique: true });
shotSchema.index({ projectId: 1, sceneId: 1, shotNumber: 1 });

export type ShotDocument = InferSchemaType<typeof shotSchema>;

export const Shot =
  (models.Shot as Model<ShotDocument> | undefined) || model<ShotDocument>("Shot", shotSchema);
