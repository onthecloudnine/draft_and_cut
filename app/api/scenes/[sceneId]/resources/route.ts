import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Scene } from "@/models/Scene";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";
import { User } from "@/models/User";
import { productionStages } from "@/types/domain";

const stagesSchema = z.array(z.enum(productionStages)).optional().default([]);

const createResourceSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).optional(),
  userId: z.string().min(1).optional(),
  stages: stagesSchema
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const user = await requireUser();
    const body = createResourceSchema.parse(await request.json());
    await connectDb();

    const userIds = Array.from(
      new Set(
        body.userIds && body.userIds.length > 0
          ? body.userIds
          : body.userId
            ? [body.userId]
            : []
      )
    );
    if (userIds.length === 0) {
      return jsonError("At least one user is required", 400);
    }

    const scene = await Scene.findById(sceneId).lean();
    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "project:manage");
    if (role !== "admin") {
      return jsonError("Only admin users can assign human resources", 403);
    }

    const [targetUsers, memberships] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("name email accountRole isActive").lean(),
      ProjectMembership.find({ projectId: scene.projectId, userId: { $in: userIds } })
        .select("userId role")
        .lean()
    ]);

    const activeUsers = targetUsers.filter((item) => item.isActive !== false);
    if (activeUsers.length === 0) {
      return jsonError("No active users selected", 400);
    }

    const userById = new Map(activeUsers.map((item) => [String(item._id), item]));
    const roleByUserId = new Map(memberships.map((item) => [String(item.userId), item.role]));

    const resources = await Promise.all(
      activeUsers.map(async (target) => {
        const update: Record<string, unknown> = {
          $setOnInsert: {
            projectId: scene.projectId,
            sceneId,
            userId: target._id,
            assignedBy: user.id
          }
        };
        if (body.stages.length > 0) {
          update.$addToSet = { stages: { $each: body.stages } };
        }

        const assignment = await SceneResourceAssignment.findOneAndUpdate(
          { sceneId, userId: target._id },
          update,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const member = userById.get(String(assignment.userId));

        return {
          id: String(assignment._id),
          userId: String(assignment.userId),
          name: member?.name ?? "",
          email: member?.email ?? "",
          role: roleByUserId.get(String(assignment.userId)) ?? member?.accountRole ?? "user",
          stages: assignment.stages ?? [],
          assignedAt: assignment.createdAt?.toISOString()
        };
      })
    );

    return NextResponse.json({ resources });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid resource payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
