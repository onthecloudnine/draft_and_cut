import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import { jsonError } from "@/lib/api/http";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await getProjectsForUser(user.id);

    return NextResponse.json({ projects });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 401);
  }
}
