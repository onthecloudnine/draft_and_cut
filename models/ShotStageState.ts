import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { sceneStages, sceneStatuses } from "@/types/domain";

// Per (shot × production stage) state: review/approval status + assigned people
// ("responsables"). The clip for the stage lives in VideoVersion(shotId, stage).
const shotStageStateSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", required: true, index: true },
    stage: { type: String, enum: sceneStages, required: true, index: true },
    reviewStatus: { type: String, enum: sceneStatuses, default: "draft" },
    assignees: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] }
  },
  { timestamps: true }
);

shotStageStateSchema.index({ shotId: 1, stage: 1 }, { unique: true });

export type ShotStageStateDocument = InferSchemaType<typeof shotStageStateSchema>;

export const ShotStageState =
  (models.ShotStageState as Model<ShotStageStateDocument> | undefined) ||
  model<ShotStageStateDocument>("ShotStageState", shotStageStateSchema);
