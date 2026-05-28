import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const boardCardSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    columnId: { type: Schema.Types.ObjectId, ref: "BoardColumn", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dueDate: { type: Date, default: null },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", default: null },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", default: null },
    labelIds: { type: [Schema.Types.ObjectId], default: [] },
    checklist: { type: [Schema.Types.Mixed], default: [] },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

boardCardSchema.index({ projectId: 1, columnId: 1, sortOrder: 1 });

export type BoardCardDocument = InferSchemaType<typeof boardCardSchema>;

export const BoardCard =
  (models.BoardCard as Model<BoardCardDocument> | undefined) ||
  model<BoardCardDocument>("BoardCard", boardCardSchema);
