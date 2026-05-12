import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { canManageUsers, isGlobalAdmin } from "@/lib/auth/admin";
import { getDictionary, getLocale } from "@/lib/i18n/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  const [dictionary, locale, userCanManageUsers, userCanManageProjects] = await Promise.all([
    getDictionary(),
    getLocale(),
    canManageUsers(session.user.id),
    isGlobalAdmin(session.user.id)
  ]);

  return (
    <AppShell
      canManageProjects={userCanManageProjects}
      canManageUsers={userCanManageUsers}
      dictionary={dictionary}
      locale={locale}
      userName={session.user.name}
    >
      {children}
    </AppShell>
  );
}
