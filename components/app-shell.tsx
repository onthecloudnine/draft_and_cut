import { AppChrome } from "@/components/app-chrome";
import { I18nProvider } from "@/lib/i18n/client";
import type { Dictionary, Locale } from "@/lib/i18n/messages";

type AppShellProps = {
  children: React.ReactNode;
  canManageProjects?: boolean;
  canManageUsers?: boolean;
  dictionary: Dictionary;
  locale: Locale;
  userName?: string | null;
};

export function AppShell({
  canManageProjects = false,
  canManageUsers = false,
  children,
  dictionary,
  locale,
  userName
}: AppShellProps) {
  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <AppChrome
        canManageProjects={canManageProjects}
        canManageUsers={canManageUsers}
        userName={userName}
      >
        {children}
      </AppChrome>
    </I18nProvider>
  );
}
