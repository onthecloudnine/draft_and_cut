import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { normalizeAssetTagName } from "@/lib/assets/tags";
import { AssetTag } from "@/models/AssetTag";
import { Scene } from "@/models/Scene";
import { SceneAssetTag } from "@/models/SceneAssetTag";
import { assetTagCategories } from "@/types/domain";

const tagInputSchema = z.object({
  category: z.enum(assetTagCategories),
  name: z.string().min(1)
});

export async function POST(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = tagInputSchema.parse(await request.json());
    const normalizedName = normalizeAssetTagName(body.name);

    if (!normalizedName) {
      return jsonError("Tag name is required", 400);
    }

    await connectDb();

    const scene = await Scene.findById(sceneId).select("projectId").lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "script:manage");

    if (role !== "admin") {
      return jsonError("Only admin users can tag scenes", 403);
    }

    const tag = await AssetTag.findOneAndUpdate(
      { projectId: scene.projectId, category: body.category, normalizedName },
      {
        $setOnInsert: {
          projectId: scene.projectId,
          category: body.category,
          name: body.name.trim().replace(/\s+/g, " "),
          normalizedName
        }
      },
      { new: true, upsert: true }
    ).lean();

    const assignment = await SceneAssetTag.findOneAndUpdate(
      { sceneId, tagId: tag._id },
      {
        $setOnInsert: {
          projectId: scene.projectId,
          sceneId,
          tagId: tag._id,
          category: body.category
        }
      },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({
      tag: {
        id: String(assignment._id),
        tagId: String(tag._id),
        category: body.category,
        name: tag.name
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid tag payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
