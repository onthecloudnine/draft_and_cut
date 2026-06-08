import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getProjectNleManifest } from "@/lib/data/nle-manifest";
import { jsonError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await assertProjectPermission(user.id, projectId, "project:read");

    const manifest = await getProjectNleManifest(projectId);

    if (!manifest) {
      return jsonError("Project not found", 404);
    }

    return NextResponse.json({ manifest });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

