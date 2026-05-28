import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getBoardSnapshot } from "@/lib/data/board";
import { jsonError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    if (!projectId || !/^[a-f0-9]{24}$/i.test(projectId)) {
      return jsonError("Invalid project id", 400);
    }
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");
    const snapshot = await getBoardSnapshot(projectId);
    return NextResponse.json(snapshot);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
