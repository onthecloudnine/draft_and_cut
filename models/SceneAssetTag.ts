import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { assetTagCategories } from "@/types/domain";

const sceneAssetTagSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true, index: true },
    tagId: { type: Schema.Types.ObjectId, ref: "AssetTag", required: true, index: true },
    category: { type: String, enum: assetTagCategories, required: true, index: true }
  },
  { timestamps: true }
);

sceneAssetTagSchema.index({ sceneId: 1, tagId: 1 }, { unique: true });

export type SceneAssetTagDocument = InferSchemaType<typeof sceneAssetTagSchema>;

export const SceneAssetTag =
  (models.SceneAssetTag as Model<SceneAssetTagDocument> | undefined) ||
  model<SceneAssetTagDocument>("SceneAssetTag", sceneAssetTagSchema);
