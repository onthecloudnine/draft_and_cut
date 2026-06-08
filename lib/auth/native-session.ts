import { requireUser } from "@/lib/auth/session";
import { verifyNativeToken } from "@/lib/auth/native-token";
import { connectDb } from "@/lib/db/mongoose";
import { User } from "@/models/User";

export type NativeUser = { id: string; name: string | null; email: string | null };

// Authenticates a request from the native/desktop client. Prefers a Bearer JWT
// (issued by /api/native/auth/login); falls back to the browser NextAuth session
// so the web app can reuse the same endpoints.
export async function requireNativeUser(request: Request): Promise<NativeUser> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");

  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    const userId = await verifyNativeToken(token);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    await connectDb();
    const user = await User.findOne({ _id: userId, isActive: true }).select("name email").lean();

    if (!user) {
      throw new Error("Unauthorized");
    }

    return { id: String(user._id), name: user.name ?? null, email: user.email ?? null };
  }

  const sessionUser = await requireUser();
  return { id: sessionUser.id, name: sessionUser.name ?? null, email: sessionUser.email ?? null };
}
