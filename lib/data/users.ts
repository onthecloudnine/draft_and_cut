import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { ProjectJoinRequest } from "@/models/ProjectJoinRequest";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import type { AccountRole, UserRole } from "@/types/domain";

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

export type ProjectJoinRequestAdminItem = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  projectId: string;
  projectTitle: string;
  requestedRole: UserRole;
  message: string;
  createdAt?: string;
};

export async function getUsersForAdmin(): Promise<{
  users: UserAdminListItem[];
  joinRequests: ProjectJoinRequestAdminItem[];
}> {
  await connectDb();

  const [users, memberships, joinRequests] = await Promise.all([
    User.find({}).sort({ name: 1, email: 1 }).lean(),
    ProjectMembership.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$userId", count: { $sum: 1 } } }
    ]),
    ProjectJoinRequest.find({ status: "pending" }).sort({ createdAt: 1 }).lean()
  ]);
  const projectCountByUserId = new Map(memberships.map((membership) => [String(membership._id), membership.count]));
  const requestUserIds = joinRequests.map((request) => request.userId);
  const requestProjectIds = joinRequests.map((request) => request.projectId);
  const [requestUsers, requestProjects] = await Promise.all([
    User.find({ _id: { $in: requestUserIds } }).select("name email").lean(),
    Project.find({ _id: { $in: requestProjectIds } }).select("title").lean()
  ]);
  const userById = new Map(requestUsers.map((user) => [String(user._id), user]));
  const projectById = new Map(requestProjects.map((project) => [String(project._id), project]));

  return {
    users: users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      accountRole: user.accountRole ?? "user",
      isActive: user.isActive,
      projectCount: projectCountByUserId.get(String(user._id)) ?? 0,
      createdAt: user.createdAt?.toISOString(),
      updatedAt: user.updatedAt?.toISOString()
    })),
    joinRequests: joinRequests
      .map((request): ProjectJoinRequestAdminItem | null => {
        const requestUser = userById.get(String(request.userId));
        const project = projectById.get(String(request.projectId));

        if (!requestUser || !project) {
          return null;
        }

        return {
          id: String(request._id),
          userId: String(request.userId),
          userName: requestUser.name,
          userEmail: requestUser.email,
          projectId: String(request.projectId),
          projectTitle: project.title,
          requestedRole: request.requestedRole ?? "read_only",
          message: request.message,
          createdAt: request.createdAt?.toISOString()
        };
      })
      .filter((request): request is ProjectJoinRequestAdminItem => Boolean(request))
  };
}
