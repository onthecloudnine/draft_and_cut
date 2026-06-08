import { SignJWT, jwtVerify } from "jose";

// JWTs issued for the native/desktop client. Signed with AUTH_SECRET (HS256),
// scoped by audience so they can't be confused with NextAuth session tokens.
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TOKEN_AUDIENCE = "tmkl-native";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export async function signNativeToken(userId: string) {
  const issuedAtMs = Date.now();
  const expiresAtMs = issuedAtMs + TOKEN_TTL_SECONDS * 1000;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(Math.floor(issuedAtMs / 1000))
    .setExpirationTime(Math.floor(expiresAtMs / 1000))
    .sign(getSecret());

  return { token, expiresAt: new Date(expiresAtMs).toISOString(), expiresInSeconds: TOKEN_TTL_SECONDS };
}

export async function verifyNativeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: TOKEN_AUDIENCE });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
