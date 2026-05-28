import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const boardCardCommentSchema = new Schema(
  {
    cardId: { type: Schema.Types.ObjectId, ref: "BoardCard", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    text: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

boardCardCommentSchema.index({ cardId: 1, createdAt: 1 });

export type BoardCardCommentDocument = InferSchemaType<typeof boardCardCommentSchema>;

export const BoardCardComment =
  (models.BoardCardComment as Model<BoardCardCommentDocument> | undefined) ||
  model<BoardCardCommentDocument>("BoardCardComment", boardCardCommentSchema);
