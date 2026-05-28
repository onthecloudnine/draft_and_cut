import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Project } from "@/models/Project";
import { ProjectMembership } from "@/models/ProjectMembership";
import { userRoles, type UserRole } from "@/types/domain";

const patchSchema = z.object({
  role: z.enum(userRoles as [string, ...string[]])
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; projectId: string }> }
) {
  try {
    const { userId, projectId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(userId) || !/^[a-f0-9]{24}$/i.test(projectId)) {
      return jsonError("Invalid id", 400);
    }
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    const body = patchSchema.parse(await request.json());
    await connectDb();

    const membership = await ProjectMembership.findOneAndUpdate(
      { userId, projectId },
      { $set: { role: body.role as UserRole } },
      { new: true }
    );
    if (!membership) return jsonError("Membership not found", 404);

    const project = await Project.findById(projectId).select("slug title").lean();
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string; projectId: string }> }
) {
  try {
    const { userId, projectId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(userId) || !/^[a-f0-9]{24}$/i.test(projectId)) {
      return jsonError("Invalid id", 400);
    }
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    await connectDb();

    const result = await ProjectMembership.deleteOne({ userId, projectId });
    if (result.deletedCount === 0) return jsonError("Membership not found", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
