import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

// Solicitud de acceso de alguien que inició sesión con un proveedor OAuth
// (p. ej. Discord) pero aún no tiene una cuenta activa. Se dedupe por email.
const accessRequestSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    provider: { type: String, default: "discord" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    attempts: { type: Number, default: 1 },
    lastAttemptAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

export type AccessRequestDocument = InferSchemaType<typeof accessRequestSchema>;

export const AccessRequest =
  (models.AccessRequest as Model<AccessRequestDocument> | undefined) ||
  model<AccessRequestDocument>("AccessRequest", accessRequestSchema);
