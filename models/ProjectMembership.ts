import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { userRoles } from "@/types/domain";

const projectMembershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    role: { type: String, enum: userRoles, required: true }
  },
  { timestamps: true }
);

projectMembershipSchema.index({ userId: 1, projectId: 1 }, { unique: true });

export type ProjectMembershipDocument = InferSchemaType<typeof projectMembershipSchema>;

export const ProjectMembership =
  (models.ProjectMembership as Model<ProjectMembershipDocument> | undefined) ||
  model<ProjectMembershipDocument>("ProjectMembership", projectMembershipSchema);
