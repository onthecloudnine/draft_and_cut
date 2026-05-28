import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { ProjectJoinRequest } from "@/models/ProjectJoinRequest";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import type { AccountRole, UserRole } from "@/types/domain";

export type UserMembershipItem = {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  role: UserRole;
};

export type UserAdminListItem = {
  id: string;
  name: string;
  email: string;
  accountRole: AccountRole;
  isActive: boolean;
  projectCount: number;
  memberships: UserMembershipItem[];
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

export type ProjectAccessAdminItem = {
  id: string;
  slug: string;
  title: string;
};

export async function getUsersForAdmin(): Promise<{
  users: UserAdminListItem[];
  joinRequests: ProjectJoinRequestAdminItem[];
  projects: ProjectAccessAdminItem[];
}> {
  await connectDb();

  const [users, memberships, joinRequests, projects] = await Promise.all([
    User.find({}).sort({ name: 1, email: 1 }).lean(),
    ProjectMembership.find({}).lean(),
    ProjectJoinRequest.find({ status: "pending" }).sort({ createdAt: 1 }).lean(),
    Project.find({}).select("slug title").sort({ title: 1 }).lean()
  ]);
  const projectInfoById = new Map(projects.map((project) => [String(project._id), project]));
  const membershipsByUserId = new Map<string, UserMembershipItem[]>();
  for (const membership of memberships) {
    const userKey = String(membership.userId);
    const projectKey = String(membership.projectId);
    const project = projectInfoById.get(projectKey);
    if (!project) continue;
    const list = membershipsByUserId.get(userKey) ?? [];
    list.push({
      projectId: projectKey,
      projectSlug: project.slug,
      projectTitle: project.title,
      role: membership.role as UserRole
    });
    membershipsByUserId.set(userKey, list);
  }
  const requestUserIds = joinRequests.map((request) => request.userId);
  const requestProjectIds = joinRequests.map((request) => request.projectId);
  const [requestUsers, requestProjects] = await Promise.all([
    User.find({ _id: { $in: requestUserIds } }).select("name email").lean(),
    Project.find({ _id: { $in: requestProjectIds } }).select("title").lean()
  ]);
  const userById = new Map(requestUsers.map((user) => [String(user._id), user]));
  const projectById = new Map(requestProjects.map((project) => [String(project._id), project]));

  return {
    users: users.map((user) => {
      const userMemberships = membershipsByUserId.get(String(user._id)) ?? [];
      return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        accountRole: user.accountRole ?? "user",
        isActive: user.isActive,
        projectCount: userMemberships.length,
        memberships: userMemberships.sort((left, right) =>
          left.projectTitle.localeCompare(right.projectTitle, undefined, { sensitivity: "base" })
        ),
        createdAt: user.createdAt?.toISOString(),
        updatedAt: user.updatedAt?.toISOString()
      };
    }),
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
      .filter((request): request is ProjectJoinRequestAdminItem => Boolean(request)),
    projects: projects.map((project) => ({
      id: String(project._id),
      slug: project.slug,
      title: project.title
    }))
  };
}
