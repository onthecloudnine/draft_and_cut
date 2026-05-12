"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/client";
import { accountRoles, userRoles, type AccountRole, type UserRole } from "@/types/domain";
import type {
  ProjectAccessAdminItem,
  ProjectJoinRequestAdminItem,
  UserAdminListItem
} from "@/lib/data/users";

type UsersAdminProps = {
  currentUserId: string;
  initialJoinRequests: ProjectJoinRequestAdminItem[];
  initialUsers: UserAdminListItem[];
  projects: ProjectAccessAdminItem[];
};

type FormState = {
  id?: string;
  name: string;
  email: string;
  password: string;
  accountRole: AccountRole;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  password: "",
  accountRole: "user",
  isActive: true
};

export function UsersAdmin({ currentUserId, initialJoinRequests, initialUsers, projects }: UsersAdminProps) {
  const { optionLabel, t } = useI18n();
  const [users, setUsers] = useState(initialUsers);
  const [joinRequests, setJoinRequests] = useState(initialJoinRequests);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(form.id);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [users]
  );

  function resetForm() {
    setForm(emptyForm);
    setError("");
    setStatus("");
  }

  function editUser(user: UserAdminListItem) {
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: "",
      accountRole: user.accountRole,
      isActive: user.isActive
    });
    setError("");
    setStatus("");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!isEditing && form.password.length < 8) {
      setError(t("users.passwordMinError"));
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(isEditing ? `/api/users/${form.id}` : "/api/users", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          accountRole: form.accountRole,
          isActive: form.isActive
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("users.saveError"));
      }

      const payload = (await response.json()) as { user: UserAdminListItem };
      setUsers((current) =>
        isEditing
          ? current.map((user) => (user.id === payload.user.id ? payload.user : user))
          : [...current, payload.user]
      );
      setStatus(isEditing ? t("users.updated") : t("users.created"));
      setForm(emptyForm);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("users.unexpectedSaveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteUser(userId: string) {
    setError("");
    setStatus("");

    const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("users.deleteError"));
      return;
    }

    setUsers((current) => current.filter((user) => user.id !== userId));
    if (form.id === userId) {
      setForm(emptyForm);
    }
    setStatus(t("users.deleted"));
  }

  function updateJoinRequestRole(requestId: string, role: UserRole) {
    setJoinRequests((current) =>
      current.map((request) => (request.id === requestId ? { ...request, requestedRole: role } : request))
    );
  }

  async function reviewJoinRequest(request: ProjectJoinRequestAdminItem, action: "approve" | "reject") {
    setError("");
    setStatus("");

    const response = await fetch(`/api/project-join-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, role: request.requestedRole })
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("users.reviewJoinRequestError"));
      return;
    }

    setJoinRequests((current) => current.filter((item) => item.id !== request.id));

    if (action === "approve") {
      setUsers((current) =>
        current.map((user) =>
          user.id === request.userId ? { ...user, projectCount: user.projectCount + 1 } : user
        )
      );
    }

    setStatus(action === "approve" ? t("users.joinRequestApproved") : t("users.joinRequestRejected"));
  }

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7">
      <section className="border-b border-neutral-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-50">{t("users.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{t("users.subtitle")}</p>
      </section>

      <section className="grid gap-5 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          className="grid content-start gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30"
          onSubmit={saveUser}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-50">
                {isEditing ? t("users.editAccount") : t("users.createAccount")}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {isEditing ? t("users.editPasswordHint") : t("users.createPasswordHint")}
              </p>
            </div>
            {isEditing ? (
              <button
                className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-neutral-800"
                onClick={resetForm}
                type="button"
              >
                {t("users.new")}
              </button>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.name")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              value={form.name}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.email")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.password")}
            <input
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              minLength={isEditing ? undefined : 8}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={isEditing ? t("users.keepPassword") : t("users.minPassword")}
              required={!isEditing}
              type="password"
              value={form.password}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-300">
            {t("users.permission")}
            <select
              className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
              onChange={(event) =>
                setForm((current) => ({ ...current, accountRole: event.target.value as AccountRole }))
              }
              value={form.accountRole}
            >
              {accountRoles.map((role) => (
                <option key={role} value={role}>
                  {optionLabel("accountRoles", role)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 text-sm font-medium text-slate-300">
            <input
              checked={form.isActive}
              className="h-4 w-4 accent-red-900"
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              type="checkbox"
            />
            {t("users.activeAccount")}
          </label>

          {error ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
          {status ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{status}</p> : null}

          <button
            className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? t("users.saving") : isEditing ? t("users.saveChanges") : t("users.createUser")}
          </button>
        </form>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-50">{t("users.accounts")}</h2>
              <p className="mt-1 text-sm text-slate-400">{t("users.registeredUsers", { count: users.length })}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-black text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t("users.user")}</th>
                  <th className="px-5 py-3 font-semibold">{t("users.permission")}</th>
                  <th className="px-5 py-3 font-semibold">{t("users.status")}</th>
                  <th className="px-5 py-3 font-semibold">{t("users.projects")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <tr className="border-t border-neutral-800" key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-50">{user.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-black px-2 py-1 text-xs font-medium text-slate-300">
                        {optionLabel("accountRoles", user.accountRole)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {user.isActive ? t("users.active") : t("users.inactive")}
                    </td>
                    <td className="px-5 py-4 text-slate-300">{user.projectCount}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-neutral-800"
                          onClick={() => editUser(user)}
                          type="button"
                        >
                          {t("users.edit")}
                        </button>
                        <button
                          className="rounded-md border border-red-900/70 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={user.id === currentUserId}
                          onClick={() => void deleteUser(user.id)}
                          type="button"
                        >
                          {t("users.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t("users.empty")}</div>
          ) : null}
        </div>
      </section>

      <section className="pb-5">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/30">
          <div className="border-b border-neutral-800 px-5 py-4">
            <h2 className="font-semibold text-slate-50">{t("users.accessPagesTitle")}</h2>
            <p className="mt-1 text-sm text-slate-400">{t("users.accessPagesSubtitle")}</p>
          </div>
          <ul className="divide-y divide-neutral-800">
            {projects.map((project) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={project.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{project.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{project.slug}</p>
                </div>
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm font-medium text-slate-200 hover:bg-neutral-800"
                  href={`/join/${project.slug}`}
                  target="_blank"
                >
                  {t("project.accessPage")}
                </Link>
              </li>
            ))}
            {projects.length === 0 ? (
              <li className="px-5 py-4 text-sm text-slate-500">{t("users.accessPagesEmpty")}</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="pb-5">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/30">
          <div className="border-b border-neutral-800 px-5 py-4">
            <h2 className="font-semibold text-slate-50">{t("users.joinRequests")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("users.pendingJoinRequests", { count: joinRequests.length })}
            </p>
          </div>
          <div className="grid gap-3 p-5">
            {joinRequests.map((request) => (
              <article className="rounded-md border border-neutral-800 bg-black/40 p-4" key={request.id}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
                  <div>
                    <h3 className="font-semibold text-slate-50">{request.userName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{request.userEmail}</p>
                    <p className="mt-2 text-sm text-slate-300">{request.projectTitle}</p>
                    {request.message ? (
                      <p className="mt-2 text-sm leading-6 text-slate-400">{request.message}</p>
                    ) : null}
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    {t("users.projectRole")}
                    <select
                      className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
                      onChange={(event) => updateJoinRequestRole(request.id, event.target.value as UserRole)}
                      value={request.requestedRole}
                    >
                      {userRoles.map((role) => (
                        <option key={role} value={role}>
                          {optionLabel("userRoles", role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      className="h-10 rounded-md bg-red-900 px-3 text-sm font-medium text-white hover:bg-red-800"
                      onClick={() => void reviewJoinRequest(request, "approve")}
                      type="button"
                    >
                      {t("users.approve")}
                    </button>
                    <button
                      className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-300 hover:bg-neutral-800"
                      onClick={() => void reviewJoinRequest(request, "reject")}
                      type="button"
                    >
                      {t("users.reject")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {joinRequests.length === 0 ? (
              <p className="text-sm text-slate-400">{t("users.noJoinRequests")}</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
