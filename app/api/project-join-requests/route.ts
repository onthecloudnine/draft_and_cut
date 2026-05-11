import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { Project } from "@/models/Project";
import { ProjectJoinRequest } from "@/models/ProjectJoinRequest";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import { userRoles } from "@/types/domain";

const joinProjectSchema = z.object({
  projectSlug: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  requestedRole: z.enum(userRoles).optional().default("read_only"),
  message: z.string().optional().default("")
});

export async function POST(request: Request) {
  try {
    const body = joinProjectSchema.parse(await request.json());
    await connectDb();

    const project = await Project.findOne({ slug: body.projectSlug }).lean();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    let user = await User.findOne({ email: body.email.toLowerCase() });

    if (user) {
      const isValidPassword = await bcrypt.compare(body.password, user.passwordHash);

      if (!isValidPassword) {
        return jsonError("No se pudo crear la solicitud con esos datos.", 400);
      }

      if (user.isActive === false) {
        user.isActive = true;
        await user.save();
      }
    } else {
      user = await User.create({
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 12),
        accountRole: "user",
        isActive: true
      });
    }

    const existingMembership = await ProjectMembership.exists({ projectId: project._id, userId: user._id });

    if (existingMembership) {
      return jsonError("La cuenta ya pertenece a este proyecto.", 409);
    }

    await ProjectJoinRequest.findOneAndUpdate(
      { projectId: project._id, userId: user._id, status: "pending" },
      {
        projectId: project._id,
        userId: user._id,
        requestedRole: body.requestedRole,
        message: body.message
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid join request payload", 400);
    }

    if (error instanceof Error && "code" in error && error.code === 11000) {
      return jsonError("Ya existe una cuenta con ese email.", 409);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
