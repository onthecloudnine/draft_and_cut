import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { commentPriorities, commentStatuses } from "@/types/domain";

const commentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    shotId: { type: Schema.Types.ObjectId, ref: "Shot", index: true },
    videoVersionId: { type: Schema.Types.ObjectId, ref: "VideoVersion", required: true, index: true },
    scriptVersionId: { type: Schema.Types.ObjectId, ref: "ScriptVersion" },
    frame: { type: Number, required: true },
    timeSeconds: { type: Number, required: true },
    timecode: { type: String, required: true },
    fps: { type: Number, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: commentStatuses, default: "open" },
    priority: { type: String, enum: commentPriorities, default: "medium" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

commentSchema.index({ videoVersionId: 1, frame: 1 });

export type CommentDocument = InferSchemaType<typeof commentSchema>;

export const Comment =
  (models.Comment as Model<CommentDocument> | undefined) ||
  model<CommentDocument>("Comment", commentSchema);
