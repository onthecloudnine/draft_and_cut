import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { assetTagCategories } from "@/types/domain";

const assetTagSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    category: { type: String, enum: assetTagCategories, required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

assetTagSchema.index({ projectId: 1, category: 1, normalizedName: 1 }, { unique: true });

export type AssetTagDocument = InferSchemaType<typeof assetTagSchema>;

export const AssetTag =
  (models.AssetTag as Model<AssetTagDocument> | undefined) || model<AssetTagDocument>("AssetTag", assetTagSchema);
