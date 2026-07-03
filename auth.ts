import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { connectDb } from "@/lib/db/mongoose";
import { AccessRequest } from "@/models/AccessRequest";
import { User } from "@/models/User";
import { notifyDiscord } from "@/lib/notify/discord";

const APP_URL = process.env.AUTH_URL ?? "http://localhost:3000";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function profileEmail(profile: unknown): string {
  const email = (profile as { email?: unknown } | null)?.email;
  return typeof email === "string" ? email.toLowerCase() : "";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Invite-only: Discord solo entra si su email verificado coincide con un
    // usuario activo ya existente; si no, se rechaza.
    async signIn({ account, profile }) {
      if (account?.provider === "discord") {
        const email = profileEmail(profile);
        const verified = (profile as { verified?: boolean } | null)?.verified === true;
        if (!email || !verified) return "/login?error=discord_email";
        await connectDb();
        const existing = await User.findOne({ email, isActive: true }).lean();
        if (!existing) {
          // Registra la solicitud (dedupe por email) y notifica por Discord solo
          // la primera vez que queda pendiente, para no spamear en reintentos.
          const name = (profile as { global_name?: string; username?: string } | null)?.global_name ??
            (profile as { username?: string } | null)?.username ??
            "";
          const before = await AccessRequest.findOne({ email }).lean();
          await AccessRequest.findOneAndUpdate(
            { email },
            {
              $set: { name, provider: "discord", lastAttemptAt: new Date() },
              $inc: { attempts: 1 },
              $setOnInsert: { status: "pending" }
            },
            { upsert: true, setDefaultsOnInsert: true }
          );
          const shouldNotify = !before || before.status !== "pending";
          if (shouldNotify) {
            await notifyDiscord(
              `🔐 **Nueva solicitud de acceso**\n**${name || email}** (${email}) intentó entrar con Discord y no tiene cuenta activa.\nApruébala en ${APP_URL}/users`
            );
          }
          return "/login?error=access_requested";
        }
      }
      return true;
    },
    // La app se apoya en el _id de Mongo; para Discord lo resolvemos por email.
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "discord") {
        const email =
          profileEmail(profile) || (typeof token.email === "string" ? token.email.toLowerCase() : "");
        if (email) {
          await connectDb();
          const dbUser = await User.findOne({ email, isActive: true }).lean();
          if (dbUser) {
            token.id = String(dbUser._id);
            token.name = dbUser.name;
            token.email = dbUser.email;
          }
        }
        return token;
      }
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    }
  },
  providers: [
    ...(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET ? [Discord] : []),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        await connectDb();

        const user = await User.findOne({
          email: parsed.data.email.toLowerCase(),
          isActive: true
        }).lean();

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        return {
          id: String(user._id),
          name: user.name,
          email: user.email
        };
      }
    })
  ]
});
