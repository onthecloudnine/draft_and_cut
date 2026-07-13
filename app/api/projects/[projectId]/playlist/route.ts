import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getProjectPlaylist } from "@/lib/data/projects";
import { jsonError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");

    const items = await getProjectPlaylist(projectId);

    return NextResponse.json({ items });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
