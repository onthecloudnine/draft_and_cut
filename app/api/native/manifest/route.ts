import { NextResponse } from "next/server";
import { requireNativeUser } from "@/lib/auth/native-session";
import { connectDb } from "@/lib/db/mongoose";
import { getProjectsForUser } from "@/lib/data/projects";
import { getProjectNleManifest } from "@/lib/data/nle-manifest";
import { jsonError } from "@/lib/api/http";

// Bulk endpoint: full manifest for every project the user can access, in one
// call. Intended for the desktop client's initial sync; use the per-project
// /api/native/projects/[projectId]/nle-manifest for targeted refreshes.
export async function GET(request: Request) {
  try {
    const user = await requireNativeUser(request);
    await connectDb();

    const projects = await getProjectsForUser(user.id);
    const manifests = await Promise.all(
      projects.map((project) => getProjectNleManifest(project.id))
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      projectCount: manifests.filter(Boolean).length,
      projects: manifests.filter((manifest): manifest is NonNullable<typeof manifest> => Boolean(manifest))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonError(message, message === "Unauthorized" ? 401 : 400);
  }
}
