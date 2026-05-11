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

const createResourceSchema = z.object({
  userId: z.string().min(1)
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

    const scene = await Scene.findById(sceneId).lean();

    if (!scene) {
      return jsonError("Scene not found", 404);
    }

    const role = await assertProjectPermission(user.id, String(scene.projectId), "project:manage");

    if (role !== "admin") {
      return jsonError("Only admin users can assign human resources", 403);
    }

    const [targetUser, membership] = await Promise.all([
      User.findById(body.userId).select("name email accountRole isActive").lean(),
      ProjectMembership.findOne({ projectId: scene.projectId, userId: body.userId }).select("role").lean()
    ]);

    if (!targetUser || targetUser.isActive === false) {
      return jsonError("User is not active", 400);
    }

    const assignment = await SceneResourceAssignment.findOneAndUpdate(
      { sceneId, userId: body.userId },
      {
        $setOnInsert: {
          projectId: scene.projectId,
          sceneId,
          userId: body.userId,
          assignedBy: user.id
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      resource: {
        id: String(assignment._id),
        userId: String(assignment.userId),
        name: targetUser.name,
        email: targetUser.email,
        role: membership?.role ?? targetUser.accountRole ?? "user",
        assignedAt: assignment.createdAt?.toISOString()
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid resource payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
