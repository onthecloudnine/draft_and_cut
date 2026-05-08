import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { canManageUsers } from "@/lib/auth/admin";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppShell canManageUsers={await canManageUsers(session.user.id)} userName={session.user.name}>
      {children}
    </AppShell>
  );
}
