import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const projectSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    fpsDefault: { type: Number, required: true, default: 24 }
  },
  { timestamps: true }
);

export type ProjectDocument = InferSchemaType<typeof projectSchema>;

export const Project =
  (models.Project as Model<ProjectDocument> | undefined) ||
  model<ProjectDocument>("Project", projectSchema);
