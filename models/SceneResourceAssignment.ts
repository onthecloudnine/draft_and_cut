import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const sceneResourceAssignmentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

sceneResourceAssignmentSchema.index({ sceneId: 1, userId: 1 }, { unique: true });
sceneResourceAssignmentSchema.index({ projectId: 1, userId: 1 });

export type SceneResourceAssignmentDocument = InferSchemaType<typeof sceneResourceAssignmentSchema>;

export const SceneResourceAssignment =
  (models.SceneResourceAssignment as Model<SceneResourceAssignmentDocument> | undefined) ||
  model<SceneResourceAssignmentDocument>("SceneResourceAssignment", sceneResourceAssignmentSchema);
