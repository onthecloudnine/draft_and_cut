"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { loginAction, signInWithDiscord } from "./actions";

export function LoginForm({ discordEnabled = false }: { discordEnabled?: boolean }) {
  const [error, action, isPending] = useActionState(loginAction, undefined);
  const { t } = useI18n();

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-muted-strong" htmlFor="email">
          {t("login.email")}
        </label>
        <input
          className="h-11 rounded-md border border-line-strong bg-background px-3 text-fg-strong outline-none focus:border-red-800 focus:ring-2 focus:ring-red-800/20"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-muted-strong" htmlFor="password">
          {t("login.password")}
        </label>
        <input
          className="h-11 rounded-md border border-line-strong bg-background px-3 text-fg-strong outline-none focus:border-red-800 focus:ring-2 focus:ring-red-800/20"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}
      <button
        className="h-11 rounded-md bg-red-900 px-4 font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? t("login.submitting") : t("login.submit")}
      </button>
      </form>

      {discordEnabled ? (
        <>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        {t("login.or")}
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={signInWithDiscord}>
        <button
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-4 font-medium text-white transition hover:bg-[#4752c4]"
          type="submit"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M20.317 4.369A19.79 19.79 0 0016.558 3.2a13.9 13.9 0 00-.617 1.267 18.27 18.27 0 00-5.882 0A13.9 13.9 0 009.44 3.2a19.79 19.79 0 00-3.76 1.169C2.13 9.66 1.166 14.82 1.64 19.9a19.94 19.94 0 006.049 3.058c.49-.667.926-1.375 1.302-2.118a12.9 12.9 0 01-2.05-.986c.172-.126.34-.257.502-.39a14.23 14.23 0 0012.114 0c.164.137.332.268.502.39-.654.386-1.343.716-2.052.988.376.742.812 1.45 1.302 2.117a19.9 19.9 0 006.052-3.058c.556-5.888-.95-11.002-3.996-15.532zM8.02 16.9c-1.183 0-2.156-1.085-2.156-2.419 0-1.333.952-2.418 2.156-2.418 1.214 0 2.177 1.096 2.156 2.418 0 1.334-.952 2.419-2.156 2.419zm7.96 0c-1.183 0-2.156-1.085-2.156-2.419 0-1.333.952-2.418 2.156-2.418 1.214 0 2.178 1.096 2.156 2.418 0 1.334-.942 2.419-2.156 2.419z" />
          </svg>
          {t("login.discord")}
        </button>
      </form>
        </>
      ) : null}
    </div>
  );
}
