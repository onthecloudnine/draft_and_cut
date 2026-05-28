import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { getBoardSnapshot } from "@/lib/data/board";
import { BoardWorkspace } from "./board-workspace";

export default async function ProjectBoardPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!projectId || !/^[a-f0-9]{24}$/i.test(projectId)) {
    notFound();
  }
  const user = await requireUser();
  const role = await assertProjectPermission(user.id, projectId, "project:read");
  await connectDb();
  const project = await Project.findById(projectId).lean();
  if (!project) notFound();

  const snapshot = await getBoardSnapshot(projectId);

  return (
    <BoardWorkspace
      canManage={role === "admin"}
      project={{ id: String(project._id), title: project.title }}
      snapshot={snapshot}
    />
  );
}
