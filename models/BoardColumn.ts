import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const boardColumnSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

boardColumnSchema.index({ projectId: 1, sortOrder: 1 });

export type BoardColumnDocument = InferSchemaType<typeof boardColumnSchema>;

export const BoardColumn =
  (models.BoardColumn as Model<BoardColumnDocument> | undefined) ||
  model<BoardColumnDocument>("BoardColumn", boardColumnSchema);
