import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";

export async function canManageUsers(userId: string) {
  await connectDb();

  const user = await User.findById(userId).select("accountRole").lean();

  if (user?.accountRole === "admin") {
    return true;
  }

  const adminMembership = await ProjectMembership.exists({ userId, role: "admin" });
  return Boolean(adminMembership);
}

export async function assertCanManageUsers(userId: string) {
  const allowed = await canManageUsers(userId);

  if (!allowed) {
    throw new Error("Forbidden");
  }
}
