import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertGlobalAdmin } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { getProjectsForUser } from "@/lib/data/projects";
import { jsonError, serializeDocument } from "@/lib/api/http";
import { Project } from "@/models/Project";
import { ProjectMembership } from "@/models/ProjectMembership";
import { Scene } from "@/models/Scene";
import { parseLiteraryScript } from "@/lib/script/import-literary-script";

const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and hyphens");

const createProjectSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional().default(""),
  fpsDefault: z.number().int().positive().max(240).optional().default(24),
  scriptText: z.string().max(1_000_000).optional(),
  sceneCount: z.number().int().min(0).max(500).optional()
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

    // Grant the creator admin membership so the project shows up in their /projects list.
    await ProjectMembership.updateOne(
      { userId: user.id, projectId: project._id },
      { $set: { role: "admin" } },
      { upsert: true }
    );

    let createdSceneCount = 0;
    let parsedSceneCount = 0;

    if (body.scriptText && body.scriptText.trim().length > 0) {
      const blocks = parseLiteraryScript(body.scriptText);
      parsedSceneCount = blocks.length;
      if (blocks.length > 0) {
        const sceneDocs = blocks.map((block, index) => ({
          projectId: project._id,
          sceneNumber: block.sceneNumber,
          title: block.heading.slice(0, 160) || `Escena ${block.sceneNumber}`,
          literaryHeading: block.heading,
          literaryScript: block.text,
          sortOrder: index
        }));
        const inserted = await Scene.insertMany(sceneDocs, { ordered: false }).catch(() => []);
        createdSceneCount = Array.isArray(inserted) ? inserted.length : 0;
      }
    } else if (typeof body.sceneCount === "number" && body.sceneCount > 0) {
      const docs = Array.from({ length: body.sceneCount }, (_, i) => ({
        projectId: project._id,
        sceneNumber: String(i + 1),
        title: `Escena ${i + 1}`,
        sortOrder: i
      }));
      const inserted = await Scene.insertMany(docs, { ordered: false }).catch(() => []);
      createdSceneCount = Array.isArray(inserted) ? inserted.length : 0;
    }

    const projectObject = project.toObject();
    return NextResponse.json({
      project: {
        ...serializeDocument(projectObject),
        id: String(projectObject._id)
      },
      createdSceneCount,
      parsedSceneCount
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid project payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
