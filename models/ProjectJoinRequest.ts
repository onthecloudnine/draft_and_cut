import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { userRoles } from "@/types/domain";

const projectJoinRequestSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedRole: { type: String, enum: userRoles, default: "read_only" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    message: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

projectJoinRequestSchema.index({ projectId: 1, userId: 1, status: 1 });

export type ProjectJoinRequestDocument = InferSchemaType<typeof projectJoinRequestSchema>;

export const ProjectJoinRequest =
  (models.ProjectJoinRequest as Model<ProjectJoinRequestDocument> | undefined) ||
  model<ProjectJoinRequestDocument>("ProjectJoinRequest", projectJoinRequestSchema);
