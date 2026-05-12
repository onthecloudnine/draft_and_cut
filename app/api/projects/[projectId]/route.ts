import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { assertGlobalAdmin } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { jsonError, serializeDocument } from "@/lib/api/http";

const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and hyphens");

const updateProjectSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  fpsDefault: z.number().int().positive().max(240).optional()
});

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const user = await requireUser();
    await assertGlobalAdmin(user.id);
    const body = updateProjectSchema.parse(await request.json());
    await connectDb();

    if (body.slug) {
      const collision = await Project.findOne({
        slug: body.slug,
        _id: { $ne: projectId }
      })
        .select("_id")
        .lean();
      if (collision) {
        return jsonError("Slug already in use", 409);
      }
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { $set: body },
      { new: true }
    ).lean();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    return NextResponse.json({ project: serializeDocument(project) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid project payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
