import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import type { Permission, UserRole } from "@/types/domain";

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    "project:read",
    "project:manage",
    "script:manage",
    "video:upload",
    "video:review",
    "video:approve",
    "comment:create",
    "comment:resolve",
    "report:read"
  ],
  director: [
    "project:read",
    "video:review",
    "video:approve",
    "comment:create",
    "comment:resolve",
    "report:read"
  ],
  producer: ["project:read", "video:review", "comment:create", "report:read"],
  animator: ["project:read", "video:upload", "video:review", "comment:create", "comment:resolve"],
  external_reviewer: ["project:read", "video:review", "comment:create"],
  read_only: ["project:read", "video:review", "report:read"]
};

export function roleHasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export async function getProjectRole(userId: string, projectId: string): Promise<UserRole | null> {
  await connectDb();

  const membership = await ProjectMembership.findOne({ userId, projectId }).lean();
  return membership?.role ?? null;
}

export async function assertProjectPermission(
  userId: string,
  projectId: string,
  permission: Permission
) {
  const role = await getProjectRole(userId, projectId);

  if (!role || !roleHasPermission(role, permission)) {
    throw new Error("Forbidden");
  }

  return role;
}
