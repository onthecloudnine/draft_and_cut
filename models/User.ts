import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { accountRoles } from "@/types/domain";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    accountRole: { type: String, enum: accountRoles, default: "user", index: true },
    image: { type: String },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User =
  (models.User as Model<UserDocument> | undefined) || model<UserDocument>("User", userSchema);
