import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const auditLogSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    summary: { type: String, required: true }
  },
  { timestamps: true }
);

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;

export const AuditLog =
  (models.AuditLog as Model<AuditLogDocument> | undefined) ||
  model<AuditLogDocument>("AuditLog", auditLogSchema);
