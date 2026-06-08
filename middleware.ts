import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // /api/native/* authenticates itself (Bearer JWT or session), so it is excluded
  // from the session-only middleware to let token-based desktop clients through.
  matcher: ["/((?!api/auth|api/native|_next/static|_next/image|favicon.ico).*)"]
};
