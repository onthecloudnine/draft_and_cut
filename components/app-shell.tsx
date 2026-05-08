import Link from "next/link";
import { logoutAction } from "@/app/login/actions";

type AppShellProps = {
  children: React.ReactNode;
  canManageUsers?: boolean;
  userName?: string | null;
};

export function AppShell({ canManageUsers = false, children, userName }: AppShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-black text-slate-100">
      <header className="h-16 border-b border-neutral-800 bg-black">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-6">
            <Link className="font-semibold text-slate-50" href="/projects">
              Draft & Cut
            </Link>
            <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/projects">
              Proyectos
            </Link>
            <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/upload">
              Subir version
            </Link>
            {canManageUsers ? (
              <Link className="text-sm font-medium text-slate-400 hover:text-slate-50" href="/users">
                Usuarios
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">{userName}</span>
            <form action={logoutAction}>
              <button className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-neutral-900">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="h-[calc(100vh-4rem)] overflow-hidden">{children}</main>
    </div>
  );
}
