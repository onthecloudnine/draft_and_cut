"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { logoutAction } from "@/app/login/actions";
import { locales, type Locale } from "@/lib/i18n/messages";
import {
  BrandMark,
  CloseIcon,
  CollapseIcon,
  DashboardIcon,
  ExpandIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  ProjectsAdminIcon,
  SunIcon,
  UploadIcon,
  UsersIcon
} from "@/components/icons";
import { useI18n } from "@/lib/i18n/client";
import { useTheme } from "@/components/theme-provider";

type NavItem = {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  matchPrefix?: string;
};

type AppChromeProps = {
  canManageProjects: boolean;
  canManageUsers: boolean;
  userName?: string | null;
  children: React.ReactNode;
};

const COLLAPSED_KEY = "dc:sidebar:collapsed";

export function AppChrome({ canManageProjects, canManageUsers, userName, children }: AppChromeProps) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(COLLAPSED_KEY) : null;
    if (stored === "0") {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const mainNav: NavItem[] = [
    { href: "/projects", labelKey: "app.projects", icon: DashboardIcon, matchPrefix: "/projects" },
    { href: "/upload", labelKey: "app.uploadVersion", icon: UploadIcon, matchPrefix: "/upload" }
  ];

  const adminNav: NavItem[] = [];
  if (canManageProjects) {
    adminNav.push({
      href: "/projects-admin",
      labelKey: "app.projectsAdmin",
      icon: ProjectsAdminIcon,
      matchPrefix: "/projects-admin"
    });
  }
  if (canManageUsers) {
    adminNav.push({ href: "/users", labelKey: "app.users", icon: UsersIcon, matchPrefix: "/users" });
  }

  const isActive = (item: NavItem) => {
    if (item.matchPrefix === "/projects") {
      return pathname === "/projects" || pathname.startsWith("/projects/");
    }
    if (item.matchPrefix) {
      return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
    }
    return pathname === item.href;
  };

  const sidebarWidth = collapsed ? "lg:w-14" : "lg:w-60";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-fg">
      {mobileOpen ? (
        <button
          aria-label={t("app.closeMenu")}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-[width] duration-200",
          "lg:static lg:translate-x-0",
          sidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ].join(" ")}
      >
        <div
          className={[
            "relative flex h-16 items-center border-b border-line",
            collapsed ? "justify-center px-2" : "justify-between px-3"
          ].join(" ")}
        >
          <Link
            className={[
              "flex items-center text-fg-strong",
              collapsed ? "justify-center" : "gap-2.5 px-1"
            ].join(" ")}
            href="/projects"
            title={collapsed ? t("app.brand") : undefined}
          >
            <BrandMark />
            {!collapsed ? (
              <span className="text-[15px] font-semibold tracking-tight">{t("app.brand")}</span>
            ) : null}
          </Link>
          <button
            aria-label={t("app.closeMenu")}
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-fg lg:hidden"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          <button
            aria-label={collapsed ? t("app.expandSidebar") : t("app.collapseSidebar")}
            className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-muted shadow-md transition hover:border-accent/60 hover:bg-elevated hover:text-fg lg:flex"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? t("app.expandSidebar") : t("app.collapseSidebar")}
            type="button"
          >
            {collapsed ? <ExpandIcon className="h-3.5 w-3.5" /> : <CollapseIcon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <nav
          className={[
            "flex flex-1 flex-col gap-1 overflow-y-auto py-3",
            collapsed ? "px-1.5" : "px-2"
          ].join(" ")}
        >
          <NavSection collapsed={collapsed} items={mainNav} isActive={isActive} t={t} />

          {adminNav.length > 0 ? (
            <>
              <div className={collapsed ? "mx-1 my-2 border-t border-line" : "mx-1 my-3 border-t border-line"} />
              {!collapsed ? (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {t("app.administration")}
                </p>
              ) : null}
              <NavSection collapsed={collapsed} items={adminNav} isActive={isActive} t={t} />
            </>
          ) : null}
        </nav>

        <div className={["flex flex-col gap-1 border-t border-line", collapsed ? "p-1.5" : "p-2"].join(" ")}>
          {userName ? (
            <div
              className={[
                "group/user relative flex items-center rounded-md text-sm",
                collapsed ? "h-10 justify-center" : "gap-2.5 px-2 py-1.5"
              ].join(" ")}
              title={collapsed ? userName : undefined}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {getInitials(userName)}
              </span>
              {!collapsed ? (
                <span className="min-w-0 flex-1 truncate text-fg">{userName}</span>
              ) : null}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition group-hover/user:opacity-100">
                  {userName}
                </span>
              ) : null}
            </div>
          ) : null}

          <SidebarThemeToggle collapsed={collapsed} t={t} />
          <SidebarLanguageSwitcher collapsed={collapsed} t={t} />

          <form action={logoutAction}>
            <button
              className={[
                "group/logout relative flex w-full items-center rounded-md text-sm font-medium text-muted transition hover:bg-elevated hover:text-fg-strong",
                collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2"
              ].join(" ")}
              type="submit"
            >
              <LogoutIcon className="h-5 w-5 shrink-0" />
              {!collapsed ? <span>{t("app.logout")}</span> : null}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition group-hover/logout:opacity-100">
                  {t("app.logout")}
                </span>
              ) : null}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-background/80 px-4 backdrop-blur lg:hidden">
          <button
            aria-label={t("app.openMenu")}
            className="rounded-md p-2 text-fg hover:bg-elevated hover:text-fg-strong"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavSection({
  collapsed,
  items,
  isActive,
  t
}: {
  collapsed: boolean;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  t: (path: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        const label = t(item.labelKey);
        return (
          <li key={item.href}>
            <Link
              className={[
                "group/nav relative flex items-center rounded-md text-sm font-medium transition",
                collapsed ? "mx-auto h-10 w-10 justify-center" : "gap-3 px-3 py-2",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-elevated hover:text-fg"
              ].join(" ")}
              href={item.href}
            >
              {active && !collapsed ? (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" aria-hidden />
              ) : null}
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed ? <span className="truncate">{label}</span> : null}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition group-hover/nav:opacity-100">
                  {label}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function SidebarThemeToggle({
  collapsed,
  t
}: {
  collapsed: boolean;
  t: (path: string) => string;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? t("app.themeLight") : t("app.themeDark");

  if (collapsed) {
    return (
      <div className="group/theme relative flex h-10 items-center justify-center">
        <button
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
          onClick={toggleTheme}
          type="button"
        >
          {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition group-hover/theme:opacity-100">
          {label}
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted transition hover:bg-elevated hover:text-fg-strong"
      onClick={toggleTheme}
      type="button"
    >
      {isDark ? <SunIcon className="h-5 w-5 shrink-0" /> : <MoonIcon className="h-5 w-5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarLanguageSwitcher({
  collapsed,
  t
}: {
  collapsed: boolean;
  t: (path: string) => string;
}) {
  const router = useRouter();
  const { locale } = useI18n();

  const changeLocale = (next: Locale) => {
    document.cookie = `dc_locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  if (collapsed) {
    return (
      <div className="group/lang relative flex h-10 items-center justify-center">
        <button
          aria-label={t("app.language")}
          className="flex h-7 w-9 items-center justify-center rounded-md border border-line bg-background text-[10px] font-semibold text-fg hover:bg-elevated"
          onClick={() => {
            const idx = locales.indexOf(locale);
            const next = locales[(idx + 1) % locales.length];
            changeLocale(next);
          }}
          type="button"
        >
          {locale.toUpperCase()}
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition group-hover/lang:opacity-100">
          {t("app.language")}: {locale.toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted">
      <span className="flex-1">{t("app.language")}</span>
      <select
        aria-label={t("app.language")}
        className="h-7 rounded-md border border-line bg-background px-2 text-[11px] font-semibold text-fg focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
        onChange={(event) => changeLocale(event.target.value as Locale)}
        value={locale}
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {item.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
