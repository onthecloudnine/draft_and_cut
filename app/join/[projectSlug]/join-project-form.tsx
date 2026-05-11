"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/client";
import { userRoles, type UserRole } from "@/types/domain";

export function JoinProjectForm({ projectSlug, projectTitle }: { projectSlug: string; projectTitle: string }) {
  const { optionLabel, t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("read_only");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/project-join-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          name,
          email,
          password,
          requestedRole,
          message
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("join.error"));
      }

      setStatus(t("join.success"));
      setName("");
      setEmail("");
      setPassword("");
      setMessage("");
      setRequestedRole("read_only");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("join.error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-slate-100">
      <section className="mx-auto grid w-full max-w-xl gap-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/30">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-red-300">{t("app.brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">{t("join.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {t("join.subtitle", { projectTitle })}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={submitRequest}>
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.name")}
            <input
              className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.email")}
            <input
              className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.password")}
            <input
              className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("join.requestedRole")}
            <select
              className="h-11 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setRequestedRole(event.target.value as UserRole)}
              value={requestedRole}
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>
                  {optionLabel("userRoles", role)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("join.message")}
            <textarea
              className="min-h-24 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100"
              onChange={(event) => setMessage(event.target.value)}
              value={message}
            />
          </label>

          {error ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
          {status ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{status}</p> : null}

          <button
            className="h-11 rounded-md bg-red-900 px-4 font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t("join.submitting") : t("join.submit")}
          </button>
        </form>

        <Link className="text-sm font-medium text-red-300 hover:text-red-200" href="/login">
          {t("join.login")}
        </Link>
      </section>
    </main>
  );
}
