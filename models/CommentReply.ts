import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const commentReplySchema = new Schema(
  {
    commentId: { type: Schema.Types.ObjectId, ref: "Comment", required: true, index: true },
    text: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

export type CommentReplyDocument = InferSchemaType<typeof commentReplySchema>;

export const CommentReply =
  (models.CommentReply as Model<CommentReplyDocument> | undefined) ||
  model<CommentReplyDocument>("CommentReply", commentReplySchema);
