import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { User } from "@/models/User";
import { accountRoles, type AccountRole } from "@/types/domain";

type SerializableUser = {
  _id: unknown;
  name: string;
  email: string;
  accountRole?: AccountRole;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  accountRole: z.enum(accountRoles).default("user"),
  isActive: z.boolean().default(true)
});

function serializeUser(user: SerializableUser) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    accountRole: user.accountRole ?? "user",
    isActive: user.isActive,
    projectCount: 0,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString()
  };
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    const body = createUserSchema.parse(await request.json());
    await connectDb();

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await User.create({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      accountRole: body.accountRole,
      isActive: body.isActive
    });

    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid user payload", 400);
    }

    if (error instanceof Error && "code" in error && error.code === 11000) {
      return jsonError("Ya existe una cuenta con ese email.", 409);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
