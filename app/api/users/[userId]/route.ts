import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { ProjectMembership } from "@/models/ProjectMembership";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";
import { User } from "@/models/User";
import { accountRoles, type AccountRole } from "@/types/domain";

type SerializableUser = {
  _id: unknown;
  name: string;
  email: string;
  accountRole?: AccountRole;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const updateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  accountRole: z.enum(accountRoles),
  isActive: z.boolean()
});

async function serializeUser(user: SerializableUser) {
  const memberships = await ProjectMembership.find({ userId: String(user._id) }).lean();
  const projectIds = memberships.map((membership) => membership.projectId);
  const { Project } = await import("@/models/Project");
  const projects = await Project.find({ _id: { $in: projectIds } }).select("slug title").lean();
  const projectMap = new Map(projects.map((project) => [String(project._id), project]));
  const items = memberships
    .map((membership) => {
      const project = projectMap.get(String(membership.projectId));
      if (!project) return null;
      return {
        projectId: String(membership.projectId),
        projectSlug: project.slug,
        projectTitle: project.title,
        role: membership.role
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) =>
      left.projectTitle.localeCompare(right.projectTitle, undefined, { sensitivity: "base" })
    );

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    accountRole: user.accountRole ?? "user",
    isActive: user.isActive,
    projectCount: items.length,
    memberships: items,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString()
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    const body = updateUserSchema.parse(await request.json());
    await connectDb();

    const update: Record<string, unknown> = {
      name: body.name,
      email: body.email.toLowerCase(),
      accountRole: body.accountRole,
      isActive: body.isActive
    };

    if (body.password) {
      update.passwordHash = await bcrypt.hash(body.password, 12);
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true });

    if (!user) {
      return jsonError("User not found", 404);
    }

    return NextResponse.json({ user: await serializeUser(user) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid user payload", 400);
    }

    if (error instanceof Error && "code" in error && error.code === 11000) {
      return jsonError("Ya existe una cuenta con ese email.", 409);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);

    if (currentUser.id === userId) {
      return jsonError("No puedes eliminar tu propia cuenta.", 400);
    }

    await connectDb();
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return jsonError("User not found", 404);
    }

    await Promise.all([
      ProjectMembership.deleteMany({ userId }),
      SceneResourceAssignment.deleteMany({ userId })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
