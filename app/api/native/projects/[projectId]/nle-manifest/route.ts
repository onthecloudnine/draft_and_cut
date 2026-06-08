import { NextResponse } from "next/server";
import { requireNativeUser } from "@/lib/auth/native-session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getProjectNleManifest } from "@/lib/data/nle-manifest";
import { jsonError } from "@/lib/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireNativeUser(request);
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

