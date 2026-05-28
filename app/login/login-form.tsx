"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, isPending] = useActionState(loginAction, undefined);
  const { t } = useI18n();

  return (
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
  );
}
