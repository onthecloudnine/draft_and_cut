import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getProjectSceneSummaries } from "@/lib/data/projects";
import { jsonError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");

    const scenes = await getProjectSceneSummaries(projectId);

    return NextResponse.json({ scenes });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
