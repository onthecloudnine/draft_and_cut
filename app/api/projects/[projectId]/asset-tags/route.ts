import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { normalizeAssetTagName } from "@/lib/assets/tags";
import { AssetTag } from "@/models/AssetTag";
import { assetTagCategories } from "@/types/domain";

const querySchema = z.object({
  category: z.enum(assetTagCategories),
  q: z.string().optional().default("")
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    const url = new URL(request.url);
    const query = querySchema.parse({
      category: url.searchParams.get("category"),
      q: url.searchParams.get("q") ?? ""
    });
    await connectDb();
    await assertProjectPermission(user.id, projectId, "project:read");

    const normalizedQuery = normalizeAssetTagName(query.q);
    const tags = await AssetTag.find({
      projectId,
      category: query.category,
      ...(normalizedQuery ? { normalizedName: { $regex: escapeRegex(normalizedQuery), $options: "i" } } : {})
    })
      .sort({ name: 1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      tags: tags.map((tag) => ({
        id: String(tag._id),
        category: tag.category,
        name: tag.name
      }))
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid tag query", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
