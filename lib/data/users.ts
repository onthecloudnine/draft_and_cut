import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import type { AccountRole } from "@/types/domain";

export type UserAdminListItem = {
  id: string;
  name: string;
  email: string;
  accountRole: AccountRole;
  isActive: boolean;
  projectCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function getUsersForAdmin(): Promise<UserAdminListItem[]> {
  await connectDb();

  const [users, memberships] = await Promise.all([
    User.find({}).sort({ name: 1, email: 1 }).lean(),
    ProjectMembership.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$userId", count: { $sum: 1 } } }
    ])
  ]);
  const projectCountByUserId = new Map(memberships.map((membership) => [String(membership._id), membership.count]));

  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    accountRole: user.accountRole ?? "user",
    isActive: user.isActive,
    projectCount: projectCountByUserId.get(String(user._id)) ?? 0,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString()
  }));
}
