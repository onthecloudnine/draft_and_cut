"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, isPending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-300" htmlFor="email">
          Email
        </label>
        <input
          className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-50 outline-none focus:border-red-800 focus:ring-2 focus:ring-red-800/20"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-300" htmlFor="password">
          Contrasena
        </label>
        <input
          className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-50 outline-none focus:border-red-800 focus:ring-2 focus:ring-red-800/20"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        className="h-11 rounded-md bg-red-900 px-4 font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
