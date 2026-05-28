import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Project } from "@/models/Project";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import { userRoles, type UserRole } from "@/types/domain";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const createSchema = z.object({
  projectId: objectId,
  role: z.enum(userRoles as [string, ...string[]])
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(userId)) return jsonError("Invalid user id", 400);
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    const body = createSchema.parse(await request.json());
    await connectDb();

    const [userExists, projectExists] = await Promise.all([
      User.exists({ _id: userId }),
      Project.exists({ _id: body.projectId })
    ]);
    if (!userExists) return jsonError("User not found", 404);
    if (!projectExists) return jsonError("Project not found", 404);

    const membership = await ProjectMembership.findOneAndUpdate(
      { userId, projectId: body.projectId },
      { $set: { role: body.role as UserRole } },
      { new: true, upsert: true }
    );

    const project = await Project.findById(body.projectId).select("slug title").lean();
    if (!project) return jsonError("Project not found", 404);

    return NextResponse.json({
      membership: {
        projectId: String(membership.projectId),
        projectSlug: project.slug,
        projectTitle: project.title,
        role: membership.role as UserRole
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid", 400);
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
