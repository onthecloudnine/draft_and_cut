import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const boardLabelSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#3b82f6" }
  },
  { timestamps: true }
);

export type BoardLabelDocument = InferSchemaType<typeof boardLabelSchema>;

export const BoardLabel =
  (models.BoardLabel as Model<BoardLabelDocument> | undefined) ||
  model<BoardLabelDocument>("BoardLabel", boardLabelSchema);
