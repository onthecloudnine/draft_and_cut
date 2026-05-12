import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertGlobalAdmin } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { getProjectsForUser } from "@/lib/data/projects";
import { jsonError, serializeDocument } from "@/lib/api/http";
import { Project } from "@/models/Project";

const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and hyphens");

const createProjectSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional().default(""),
  fpsDefault: z.number().int().positive().max(240).optional().default(24)
});

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await getProjectsForUser(user.id);

    return NextResponse.json({ projects });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 401);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await assertGlobalAdmin(user.id);
    const body = createProjectSchema.parse(await request.json());
    await connectDb();

    const existing = await Project.findOne({ slug: body.slug }).lean();
    if (existing) {
      return jsonError("Slug already in use", 409);
    }

    const project = await Project.create({
      slug: body.slug,
      title: body.title,
      description: body.description,
      fpsDefault: body.fpsDefault
    });

    return NextResponse.json({ project: serializeDocument(project.toObject()) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid project payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
