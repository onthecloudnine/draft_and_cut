import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { signNativeToken } from "@/lib/auth/native-token";
import { User } from "@/models/User";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError("Invalid credentials payload", 400);
    }

    await connectDb();

    const user = await User.findOne({
      email: parsed.data.email.toLowerCase(),
      isActive: true
    }).lean();

    if (!user || !user.passwordHash) {
      return jsonError("Invalid email or password", 401);
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);

    if (!isValid) {
      return jsonError("Invalid email or password", 401);
    }

    const { token, expiresAt, expiresInSeconds } = await signNativeToken(String(user._id));

    return NextResponse.json({
      tokenType: "Bearer",
      token,
      expiresAt,
      expiresInSeconds,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
