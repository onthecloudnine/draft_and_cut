import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { I18nProvider } from "@/lib/i18n/client";
import type { Dictionary, Locale } from "@/lib/i18n/messages";
import { translate } from "@/lib/i18n/messages";
import { LanguageSwitcher } from "@/components/language-switcher";

type AppShellProps = {
  children: React.ReactNode;
  canManageUsers?: boolean;
  dictionary: Dictionary;
  locale: Locale;
  userName?: string | null;
};

export function AppShell({ canManageUsers = false, children, dictionary, locale, userName }: AppShellProps) {
  const t = (path: string) => translate(dictionary, path);

  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <div className="h-screen overflow-hidden bg-black text-slate-100">
        <header className="h-16 border-b border-neutral-800 bg-black">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-6">
              <Link className="font-semibold text-slate-50" href="/projects">
                {t("app.brand")}
              </Link>
              <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/projects">
                {t("app.projects")}
              </Link>
              <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/upload">
                {t("app.uploadVersion")}
              </Link>
              {canManageUsers ? (
                <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/users">
                  {t("app.users")}
                </Link>
              ) : null}
            </nav>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <span className="hidden text-sm text-slate-400 sm:inline">{userName}</span>
              <form action={logoutAction}>
                <button className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-neutral-900">
                  {t("app.logout")}
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="h-[calc(100vh-4rem)] overflow-hidden">{children}</main>
      </div>
    </I18nProvider>
  );
}
