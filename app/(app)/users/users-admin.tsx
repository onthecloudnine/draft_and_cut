"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/client";
import { accountRoles, userRoles, type AccountRole, type UserRole } from "@/types/domain";
import type {
  ProjectAccessAdminItem,
  ProjectJoinRequestAdminItem,
  UserAdminListItem,
  UserMembershipItem
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

  async function addMembership(userId: string, projectId: string, role: UserRole) {
    setError("");
    setStatus("");
    if (!projectId) return;

    try {
      const response = await fetch(`/api/users/${userId}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, role })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("users.assignProjectError"));
      }

      const payload = (await response.json()) as { membership: UserMembershipItem };
      setUsers((current) =>
        current.map((user) => {
          if (user.id !== userId) return user;
          const others = user.memberships.filter((item) => item.projectId !== payload.membership.projectId);
          const next = [...others, payload.membership].sort((left, right) =>
            left.projectTitle.localeCompare(right.projectTitle, undefined, { sensitivity: "base" })
          );
          return { ...user, memberships: next, projectCount: next.length };
        })
      );
      setStatus(t("users.assignProjectSuccess"));
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : t("users.assignProjectError"));
    }
  }

  async function updateMembershipRole(userId: string, projectId: string, role: UserRole) {
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/users/${userId}/memberships/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("users.assignProjectError"));
      }

      const payload = (await response.json()) as { membership: UserMembershipItem };
      setUsers((current) =>
        current.map((user) => {
          if (user.id !== userId) return user;
          const next = user.memberships.map((item) =>
            item.projectId === payload.membership.projectId ? payload.membership : item
          );
          return { ...user, memberships: next };
        })
      );
      setStatus(t("users.membershipRoleUpdated"));
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : t("users.assignProjectError"));
    }
  }

  async function removeMembership(userId: string, projectId: string) {
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/users/${userId}/memberships/${projectId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("users.removeMembershipError"));
      }

      setUsers((current) =>
        current.map((user) => {
          if (user.id !== userId) return user;
          const next = user.memberships.filter((item) => item.projectId !== projectId);
          return { ...user, memberships: next, projectCount: next.length };
        })
      );
      setStatus(t("users.removeMembershipSuccess"));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t("users.removeMembershipError"));
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
      <section className="border-b border-line pb-5">
        <h1 className="text-2xl font-semibold text-fg-strong">{t("users.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("users.subtitle")}</p>
      </section>

      <section className="grid gap-5 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          className="grid content-start gap-4 rounded-lg border border-line bg-surface p-5 shadow-lg shadow-black/30"
          onSubmit={saveUser}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-fg-strong">
                {isEditing ? t("users.editAccount") : t("users.createAccount")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {isEditing ? t("users.editPasswordHint") : t("users.createPasswordHint")}
              </p>
            </div>
            {isEditing ? (
              <button
                className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-muted-strong hover:bg-elevated"
                onClick={resetForm}
                type="button"
              >
                {t("users.new")}
              </button>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("users.name")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              value={form.name}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("users.email")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("users.password")}
            <input
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
              minLength={isEditing ? undefined : 8}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={isEditing ? t("users.keepPassword") : t("users.minPassword")}
              required={!isEditing}
              type="password"
              value={form.password}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-muted-strong">
            {t("users.permission")}
            <select
              className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
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

          <label className="flex items-center gap-3 text-sm font-medium text-muted-strong">
            <input
              checked={form.isActive}
              className="h-4 w-4 accent-red-900"
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              type="checkbox"
            />
            {t("users.activeAccount")}
          </label>

          {error ? <p className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-fg">{error}</p> : null}
          {status ? <p className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-fg">{status}</p> : null}

          <button
            className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? t("users.saving") : isEditing ? t("users.saveChanges") : t("users.createUser")}
          </button>
        </form>

        <div className="rounded-lg border border-line bg-surface shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold text-fg-strong">{t("users.accounts")}</h2>
              <p className="mt-1 text-sm text-muted">{t("users.registeredUsers", { count: users.length })}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-elevated text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t("users.user")}</th>
                  <th className="px-5 py-3 font-semibold">{t("users.permission")}</th>
                  <th className="px-5 py-3 font-semibold">{t("users.status")}</th>
                  <th className="w-[340px] px-5 py-3 font-semibold">{t("users.projects")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <tr className="border-t border-line align-top" key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-fg-strong">{user.name}</p>
                      <p className="mt-1 text-xs text-muted">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-elevated px-2 py-1 text-xs font-medium text-muted-strong">
                        {optionLabel("accountRoles", user.accountRole)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-strong">
                      {user.isActive ? t("users.active") : t("users.inactive")}
                    </td>
                    <td className="px-5 py-4">
                      <UserMembershipsCell
                        user={user}
                        projects={projects}
                        onAdd={addMembership}
                        onUpdate={updateMembershipRole}
                        onRemove={removeMembership}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md border border-line-strong px-3 py-2 text-xs font-medium text-muted-strong hover:bg-elevated"
                          onClick={() => editUser(user)}
                          type="button"
                        >
                          {t("users.edit")}
                        </button>
                        <button
                          className="rounded-md border border-danger px-3 py-2 text-xs font-medium text-danger-fg hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="p-8 text-center text-sm text-muted">{t("users.empty")}</div>
          ) : null}
        </div>
      </section>

      <section className="pb-5">
        <div className="rounded-lg border border-line bg-surface shadow-lg shadow-black/30">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-fg-strong">{t("users.accessPagesTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("users.accessPagesSubtitle")}</p>
          </div>
          <ul className="divide-y divide-line">
            {projects.map((project) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={project.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{project.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{project.slug}</p>
                </div>
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-elevated"
                  href={`/join/${project.slug}`}
                  target="_blank"
                >
                  {t("project.accessPage")}
                </Link>
              </li>
            ))}
            {projects.length === 0 ? (
              <li className="px-5 py-4 text-sm text-muted">{t("users.accessPagesEmpty")}</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="pb-5">
        <div className="rounded-lg border border-line bg-surface shadow-lg shadow-black/30">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-fg-strong">{t("users.joinRequests")}</h2>
            <p className="mt-1 text-sm text-muted">
              {t("users.pendingJoinRequests", { count: joinRequests.length })}
            </p>
          </div>
          <div className="grid gap-3 p-5">
            {joinRequests.map((request) => (
              <article className="rounded-md border border-line bg-elevated p-4" key={request.id}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
                  <div>
                    <h3 className="font-semibold text-fg-strong">{request.userName}</h3>
                    <p className="mt-1 text-sm text-muted">{request.userEmail}</p>
                    <p className="mt-2 text-sm text-muted-strong">{request.projectTitle}</p>
                    {request.message ? (
                      <p className="mt-2 text-sm leading-6 text-muted">{request.message}</p>
                    ) : null}
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-muted-strong">
                    {t("users.projectRole")}
                    <select
                      className="h-10 rounded-md border border-line-strong bg-background px-3 text-fg"
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
                      className="h-10 rounded-md border border-line-strong px-3 text-sm font-medium text-muted-strong hover:bg-elevated"
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
              <p className="text-sm text-muted">{t("users.noJoinRequests")}</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function UserMembershipsCell({
  user,
  projects,
  onAdd,
  onUpdate,
  onRemove
}: {
  user: UserAdminListItem;
  projects: ProjectAccessAdminItem[];
  onAdd: (userId: string, projectId: string, role: UserRole) => Promise<void>;
  onUpdate: (userId: string, projectId: string, role: UserRole) => Promise<void>;
  onRemove: (userId: string, projectId: string) => Promise<void>;
}) {
  const { optionLabel, t } = useI18n();
  const assignedIds = new Set(user.memberships.map((membership) => membership.projectId));
  const available = projects.filter((project) => !assignedIds.has(project.id));
  const [selectedProjectId, setSelectedProjectId] = useState(available[0]?.id ?? "");
  const [selectedRole, setSelectedRole] = useState<UserRole>(userRoles[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveProjectId = available.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : available[0]?.id ?? "";

  async function handleAdd() {
    if (!effectiveProjectId) return;
    setIsSubmitting(true);
    try {
      await onAdd(user.id, effectiveProjectId, selectedRole);
      const remaining = available.filter((project) => project.id !== effectiveProjectId);
      setSelectedProjectId(remaining[0]?.id ?? "");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-2">
      {user.memberships.length === 0 ? (
        <p className="text-xs text-muted">{t("users.noMemberships")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {user.memberships.map((membership) => (
            <li
              className="flex items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1.5"
              key={membership.projectId}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={membership.projectTitle}>
                {membership.projectTitle}
              </span>
              <select
                aria-label={t("users.projectRole")}
                className="h-7 rounded border border-line-strong bg-background px-1.5 text-[11px] font-medium text-fg"
                onChange={(event) =>
                  void onUpdate(user.id, membership.projectId, event.target.value as UserRole)
                }
                value={membership.role}
              >
                {userRoles.map((role) => (
                  <option key={role} value={role}>
                    {optionLabel("userRoles", role)}
                  </option>
                ))}
              </select>
              <button
                aria-label={t("users.removeMembership")}
                className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-danger-soft hover:text-danger-fg"
                onClick={() => void onRemove(user.id, membership.projectId)}
                title={t("users.removeMembership")}
                type="button"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <select
            aria-label={t("users.assignProjectLabel")}
            className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-background px-2 text-xs text-fg"
            onChange={(event) => setSelectedProjectId(event.target.value)}
            value={effectiveProjectId}
          >
            {available.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <select
            aria-label={t("users.projectRole")}
            className="h-8 rounded-md border border-line-strong bg-background px-1.5 text-[11px] font-medium text-fg"
            onChange={(event) => setSelectedRole(event.target.value as UserRole)}
            value={selectedRole}
          >
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {optionLabel("userRoles", role)}
              </option>
            ))}
          </select>
          <button
            className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !effectiveProjectId}
            onClick={() => void handleAdd()}
            type="button"
          >
            {isSubmitting ? t("users.assigning") : t("users.assign")}
          </button>
        </div>
      ) : projects.length > 0 ? (
        <p className="text-[11px] text-muted">{t("users.allProjectsAssigned")}</p>
      ) : (
        <p className="text-[11px] text-muted">{t("users.accessPagesEmpty")}</p>
      )}
    </div>
  );
}
