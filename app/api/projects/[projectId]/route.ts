import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { jsonError, serializeDocument } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    await connectDb();

    const project = await Project.findById(projectId).lean();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    return NextResponse.json({ project: serializeDocument(project) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
