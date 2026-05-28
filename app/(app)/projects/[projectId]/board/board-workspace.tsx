"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BoardSnapshot } from "@/lib/data/board";
import { useI18n } from "@/lib/i18n/client";

type Column = BoardSnapshot["columns"][number];
type Label = BoardSnapshot["labels"][number];
type Card = BoardSnapshot["cards"][number];
type Member = BoardSnapshot["members"][number];
type Scene = BoardSnapshot["scenes"][number];
type Shot = BoardSnapshot["shots"][number];

type Props = {
  canManage: boolean;
  project: { id: string; title: string };
  snapshot: BoardSnapshot;
};

const COLUMN_COLOR_PRESETS = [
  "#64748b",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#eab308"
];

const LABEL_COLOR_PRESETS = [
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#eab308",
  "#06b6d4",
  "#ec4899"
];

function memberLabel(member: { name?: string; email?: string } | null | undefined): string {
  if (!member) return "—";
  const name = member.name?.trim();
  if (name) return name;
  return member.email?.trim() || "—";
}

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "—") return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || trimmed[0]?.toUpperCase() || "?";
}

function colorFromString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  const palette = ["#3b82f6", "#a855f7", "#22c55e", "#f97316", "#ef4444", "#eab308", "#06b6d4", "#ec4899"];
  return palette[Math.abs(hash) % palette.length];
}

function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" | "md" }) {
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-[11px]";
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: colorFromString(name) }}
      title={name}
    >
      {initialsFromName(name)}
    </span>
  );
}

export function BoardWorkspace({ canManage, project, snapshot }: Props) {
  const { t } = useI18n();
  const [columns, setColumns] = useState<Column[]>(snapshot.columns);
  const [labels, setLabels] = useState<Label[]>(snapshot.labels);
  const [cards, setCards] = useState<Card[]>(snapshot.cards);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [isCreatingCardInColumn, setIsCreatingCardInColumn] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [isLabelManagerOpen, setIsLabelManagerOpen] = useState(false);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const members = snapshot.members;
  const scenes = snapshot.scenes;
  const shots = snapshot.shots;

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of cards) {
      const list = map.get(card.columnId) ?? [];
      list.push(card);
      map.set(card.columnId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [cards]);

  async function api<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? "Error");
    }
    return response.json();
  }

  async function createColumn(name: string, color: string) {
    const { column } = await api<{ column: Column }>(
      `/api/projects/${project.id}/board/columns`,
      { method: "POST", body: JSON.stringify({ name, color }) }
    );
    setColumns((current) => [...current, column]);
  }

  async function updateColumn(columnId: string, patch: Partial<Column>) {
    const { column } = await api<{ column: Column }>(
      `/api/projects/${project.id}/board/columns/${columnId}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
    setColumns((current) => current.map((c) => (c.id === columnId ? column : c)));
  }

  async function deleteColumn(columnId: string) {
    if (!window.confirm(t("board.deleteColumnConfirm"))) return;
    await api(`/api/projects/${project.id}/board/columns/${columnId}`, { method: "DELETE" });
    setColumns((current) => current.filter((c) => c.id !== columnId));
    setCards((current) => current.filter((card) => card.columnId !== columnId));
  }

  async function createCard(columnId: string, title: string) {
    const { card } = await api<{ card: Card }>(`/api/projects/${project.id}/board/cards`, {
      method: "POST",
      body: JSON.stringify({ columnId, title })
    });
    setCards((current) => [...current, card]);
  }

  async function updateCard(cardId: string, patch: Partial<Card> & { dueDate?: string | null }) {
    const { card } = await api<{ card: Card }>(`/api/projects/${project.id}/board/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    setCards((current) =>
      current.map((existing) => {
        if (existing.id !== cardId) return existing;
        // Server response doesn't include assigneeName (would require a join). Recompute locally.
        const member = members.find((m) => m.id === card.assigneeUserId);
        return { ...card, assigneeName: member?.name ?? null };
      })
    );
  }

  async function deleteCard(cardId: string) {
    if (!window.confirm(t("board.deleteCardConfirm"))) return;
    await api(`/api/projects/${project.id}/board/cards/${cardId}`, { method: "DELETE" });
    setCards((current) => current.filter((card) => card.id !== cardId));
    setEditingCard(null);
  }

  async function createLabel(name: string, color: string) {
    const { label } = await api<{ label: Label }>(`/api/projects/${project.id}/board/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color })
    });
    setLabels((current) => [...current, label]);
  }

  async function deleteLabel(labelId: string) {
    if (!window.confirm(t("board.deleteLabelConfirm"))) return;
    await api(`/api/projects/${project.id}/board/labels/${labelId}`, { method: "DELETE" });
    setLabels((current) => current.filter((label) => label.id !== labelId));
    setCards((current) =>
      current.map((card) => ({ ...card, labelIds: card.labelIds.filter((id) => id !== labelId) }))
    );
  }

  function handleColumnDrop(targetColumnId: string) {
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      return;
    }
    const fromIdx = columns.findIndex((c) => c.id === draggedColumnId);
    const toIdx = columns.findIndex((c) => c.id === targetColumnId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggedColumnId(null);
      return;
    }
    const next = [...columns];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const reordered = next.map((column, index) => ({ ...column, sortOrder: index }));
    setColumns(reordered);
    void api(`/api/projects/${project.id}/board/columns/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ columnIds: reordered.map((c) => c.id) })
    }).catch((err) => setError(err instanceof Error ? err.message : "Error"));
    setDraggedColumnId(null);
  }

  function handleCardDrop(targetColumnId: string, beforeCardId: string | null) {
    if (!draggedCardId) return;
    const dragged = cards.find((card) => card.id === draggedCardId);
    if (!dragged) return;
    const targetList = cards
      .filter((card) => card.columnId === targetColumnId && card.id !== draggedCardId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const beforeIndex = beforeCardId
      ? targetList.findIndex((card) => card.id === beforeCardId)
      : targetList.length;
    const before = targetList[beforeIndex - 1];
    const after = beforeCardId ? targetList[beforeIndex] : undefined;
    let nextSort: number;
    if (!before && !after) nextSort = 1000;
    else if (!before && after) nextSort = after.sortOrder - 1;
    else if (before && !after) nextSort = before.sortOrder + 1;
    else nextSort = (before!.sortOrder + after!.sortOrder) / 2;
    setCards((current) =>
      current.map((card) =>
        card.id === draggedCardId ? { ...card, columnId: targetColumnId, sortOrder: nextSort } : card
      )
    );
    void updateCard(draggedCardId, { columnId: targetColumnId, sortOrder: nextSort }).catch(
      (err) => setError(err instanceof Error ? err.message : "Error")
    );
    setDraggedCardId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
              href={`/projects/${project.id}`}
            >
              ← {t("scene.backToProject")}
            </Link>
            <div className="hidden h-6 w-px bg-zinc-800 sm:block" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                {t("board.kanbanLabel")}
              </p>
              <h1 className="text-base font-semibold text-zinc-50 sm:text-lg">{project.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage ? (
              <button
                className="inline-flex h-8 items-center rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                onClick={() => setIsLabelManagerOpen(true)}
                type="button"
              >
                {t("board.manageLabels")}
              </button>
            ) : null}
            {canManage ? (
              <button
                className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500"
                onClick={() => setIsAddingColumn(true)}
                type="button"
              >
                + {t("board.addColumn")}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-5 mt-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4">
        {columns.map((column) => (
          <ColumnView
            canManage={canManage}
            cards={cardsByColumn.get(column.id) ?? []}
            column={column}
            draggedCardId={draggedCardId}
            draggedColumnId={draggedColumnId}
            isCreatingCard={isCreatingCardInColumn === column.id}
            key={column.id}
            labels={labels}
            members={members}
            onCardClick={(card) => setEditingCard(card)}
            onColumnDragEnd={() => setDraggedColumnId(null)}
            onColumnDragStart={() => setDraggedColumnId(column.id)}
            onColumnDrop={() => handleColumnDrop(column.id)}
            onCreateCard={(title) => {
              void createCard(column.id, title);
              setIsCreatingCardInColumn(null);
            }}
            onDeleteColumn={() => deleteColumn(column.id)}
            onDragEndCard={() => setDraggedCardId(null)}
            onDragStartCard={(id) => setDraggedCardId(id)}
            onDropAtPosition={(beforeCardId) => handleCardDrop(column.id, beforeCardId)}
            onRenameColumn={(name) => updateColumn(column.id, { name })}
            onSetColumnColor={(color) => updateColumn(column.id, { color })}
            onStartCreateCard={() => setIsCreatingCardInColumn(column.id)}
            onCancelCreateCard={() => setIsCreatingCardInColumn(null)}
            t={t}
          />
        ))}
        {columns.length === 0 ? (
          <p className="m-auto text-sm text-zinc-500">{t("board.empty")}</p>
        ) : null}
      </div>

      {editingCard ? (
        <CardEditModal
          canManage={canManage}
          card={editingCard}
          labels={labels}
          members={members}
          onChange={(patch) => {
            setEditingCard((current) => (current ? { ...current, ...patch } : null));
            void updateCard(editingCard.id, patch).catch((err) =>
              setError(err instanceof Error ? err.message : "Error")
            );
          }}
          onClose={() => setEditingCard(null)}
          onDelete={() => deleteCard(editingCard.id)}
          projectId={project.id}
          scenes={scenes}
          shots={shots}
          t={t}
        />
      ) : null}

      {isAddingColumn ? (
        <AddColumnModal
          colorPresets={COLUMN_COLOR_PRESETS}
          onCancel={() => setIsAddingColumn(false)}
          onConfirm={async (name, color) => {
            try {
              await createColumn(name, color);
              setIsAddingColumn(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
          t={t}
        />
      ) : null}

      {isLabelManagerOpen ? (
        <LabelManagerModal
          colorPresets={LABEL_COLOR_PRESETS}
          labels={labels}
          onClose={() => setIsLabelManagerOpen(false)}
          onCreate={async (name, color) => {
            try {
              await createLabel(name, color);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteLabel(id);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
          t={t}
        />
      ) : null}
    </div>
  );
}

function ColumnView({
  canManage,
  cards,
  column,
  draggedCardId,
  draggedColumnId,
  isCreatingCard,
  labels,
  members,
  onCancelCreateCard,
  onCardClick,
  onColumnDragEnd,
  onColumnDragStart,
  onColumnDrop,
  onCreateCard,
  onDeleteColumn,
  onDragEndCard,
  onDragStartCard,
  onDropAtPosition,
  onRenameColumn,
  onSetColumnColor,
  onStartCreateCard,
  t
}: {
  canManage: boolean;
  cards: Card[];
  column: Column;
  draggedCardId: string | null;
  draggedColumnId: string | null;
  isCreatingCard: boolean;
  labels: Label[];
  members: Member[];
  onCancelCreateCard: () => void;
  onCardClick: (card: Card) => void;
  onColumnDragEnd: () => void;
  onColumnDragStart: () => void;
  onColumnDrop: () => void;
  onCreateCard: (title: string) => void;
  onDeleteColumn: () => void;
  onDragEndCard: () => void;
  onDragStartCard: (cardId: string) => void;
  onDropAtPosition: (beforeCardId: string | null) => void;
  onRenameColumn: (name: string) => void;
  onSetColumnColor: (color: string) => void;
  onStartCreateCard: () => void;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const [newCardTitle, setNewCardTitle] = useState("");
  const isColumnDragging = draggedColumnId === column.id;

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900 transition ${
        isColumnDragging ? "opacity-50" : ""
      }`}
      onDragOver={(event) => {
        if (draggedColumnId && draggedColumnId !== column.id) {
          event.preventDefault();
        } else if (draggedCardId) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (draggedColumnId) {
          event.stopPropagation();
          onColumnDrop();
        } else if (draggedCardId) {
          onDropAtPosition(null);
        }
      }}
    >
      <div
        className={`flex items-center gap-2 border-b border-zinc-800 px-3 py-2 ${
          canManage ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        draggable={canManage && !editingName}
        onDragEnd={onColumnDragEnd}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onColumnDragStart();
        }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: column.color || "#64748b" }}
        />
        {editingName && canManage ? (
          <input
            autoFocus
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-red-600/60 focus:outline-none"
            onBlur={() => {
              const next = nameDraft.trim();
              if (next && next !== column.name) onRenameColumn(next);
              setEditingName(false);
            }}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              if (event.key === "Escape") {
                setNameDraft(column.name);
                setEditingName(false);
              }
            }}
            value={nameDraft}
          />
        ) : (
          <button
            className="flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-zinc-100 disabled:cursor-default"
            disabled={!canManage}
            onClick={() => {
              setNameDraft(column.name);
              setEditingName(true);
            }}
            type="button"
          >
            {column.name}
          </button>
        )}
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
          {cards.length}
        </span>
        {canManage ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="13" cy="8" r="1.5" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("board.color")}
              </p>
              <div className="flex flex-wrap gap-1 pb-2">
                {["#64748b", "#3b82f6", "#a855f7", "#22c55e", "#f97316", "#ef4444", "#eab308"].map(
                  (color) => (
                    <button
                      className="h-5 w-5 rounded-full border border-zinc-700"
                      key={color}
                      onClick={() => onSetColumnColor(color)}
                      style={{ background: color }}
                      type="button"
                    />
                  )
                )}
              </div>
              <button
                className="w-full rounded px-2 py-1 text-left text-xs text-red-300 hover:bg-red-950/40"
                onClick={onDeleteColumn}
                type="button"
              >
                {t("board.deleteColumn")}
              </button>
            </div>
          </details>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {cards.map((card) => (
          <div
            className={`group rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-sm shadow-sm transition hover:border-zinc-700 ${
              draggedCardId === card.id ? "opacity-40" : ""
            }`}
            draggable={canManage}
            key={card.id}
            onClick={() => onCardClick(card)}
            onDragEnd={onDragEndCard}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => onDragStartCard(card.id)}
            onDrop={(event) => {
              event.stopPropagation();
              onDropAtPosition(card.id);
            }}
          >
            {card.labelIds.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {card.labelIds.map((labelId) => {
                  const label = labels.find((l) => l.id === labelId);
                  if (!label) return null;
                  return (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      key={labelId}
                      style={{ background: label.color }}
                    >
                      {label.name}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <p className="font-medium text-zinc-100">{card.title}</p>
            {card.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{card.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              {card.checklist.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M9 11l3 3 8-8" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span className="tabular-nums">
                    {card.checklist.filter((item) => item.done).length}/{card.checklist.length}
                  </span>
                </span>
              ) : null}
              {card.dueDate ? (
                <span
                  className={
                    new Date(card.dueDate) < new Date()
                      ? "rounded bg-red-950/60 px-1.5 py-0.5 text-red-300"
                      : "rounded bg-zinc-800 px-1.5 py-0.5"
                  }
                >
                  {new Date(card.dueDate).toLocaleDateString()}
                </span>
              ) : null}
              {card.assigneeName ? (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-800 py-0.5 pl-0.5 pr-2 text-zinc-200">
                  <Avatar name={card.assigneeName} size="xs" />
                  <span className="text-[11px] font-medium">{card.assigneeName}</span>
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {isCreatingCard ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-950 p-2">
            <textarea
              autoFocus
              className="w-full resize-none rounded border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
              onChange={(event) => setNewCardTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const title = newCardTitle.trim();
                  if (title) onCreateCard(title);
                  setNewCardTitle("");
                }
                if (event.key === "Escape") {
                  setNewCardTitle("");
                  onCancelCreateCard();
                }
              }}
              placeholder={t("board.newCardPlaceholder")}
              rows={2}
              value={newCardTitle}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                onClick={() => {
                  const title = newCardTitle.trim();
                  if (title) onCreateCard(title);
                  setNewCardTitle("");
                }}
                type="button"
              >
                {t("board.add")}
              </button>
              <button
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => {
                  setNewCardTitle("");
                  onCancelCreateCard();
                }}
                type="button"
              >
                {t("scene.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="rounded-md border border-dashed border-zinc-800 px-2 py-2 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            onClick={onStartCreateCard}
            type="button"
          >
            + {t("board.addCard")}
          </button>
        )}
      </div>
    </div>
  );
}

function CardEditModal({
  canManage,
  card,
  labels,
  members,
  onChange,
  onClose,
  onDelete,
  projectId,
  scenes,
  shots,
  t
}: {
  canManage: boolean;
  card: Card;
  labels: Label[];
  members: Member[];
  onChange: (patch: Partial<Card> & { dueDate?: string | null }) => void;
  onClose: () => void;
  onDelete: () => void;
  projectId: string;
  scenes: Scene[];
  shots: Shot[];
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [comments, setComments] = useState<
    Array<{ id: string; text: string; createdAt: string; authorId: string; authorName: string }>
  >([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  const filteredShots = card.sceneId ? shots.filter((shot) => shot.sceneId === card.sceneId) : [];
  const dueDateValue = card.dueDate ? card.dueDate.slice(0, 10) : "";
  const assignee = card.assigneeUserId
    ? members.find((member) => member.id === card.assigneeUserId)
    : null;
  const checklistItems = card.checklist ?? [];
  const checklistDone = checklistItems.filter((item) => item.done).length;
  const checklistTotal = checklistItems.length;
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  useEffect(() => {
    if (commentsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/board/cards/${card.id}/comments`
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          comments: Array<{
            id: string;
            text: string;
            createdAt: string;
            authorId: string;
            authorName: string;
          }>;
        };
        if (!cancelled) {
          setComments(data.comments);
          setCommentsLoaded(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card.id, projectId, commentsLoaded]);

  async function submitComment() {
    const text = commentDraft.trim();
    if (!text) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/board/cards/${card.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        comment: { id: string; text: string; createdAt: string; authorId: string; authorName: string };
      };
      setComments((current) => [...current, data.comment]);
      setCommentDraft("");
    } catch {
      /* ignore */
    }
  }

  async function deleteComment(commentId: string) {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/board/cards/${card.id}/comments/${commentId}`,
        { method: "DELETE" }
      );
      if (response.ok) setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch {
      /* ignore */
    }
  }

  function addChecklistItem() {
    const text = newChecklistItem.trim();
    if (!text) return;
    const nextItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, done: false };
    onChange({ checklist: [...checklistItems, nextItem] });
    setNewChecklistItem("");
  }

  function updateChecklistItem(id: string, patch: Partial<{ text: string; done: boolean }>) {
    onChange({
      checklist: checklistItems.map((item) => (item.id === id ? { ...item, ...patch } : item))
    });
  }

  function removeChecklistItem(id: string) {
    onChange({ checklist: checklistItems.filter((item) => item.id !== id) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="grid max-h-[90vh] min-h-0 w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <input
            className="flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-base font-semibold text-zinc-50 focus:border-red-600/60 focus:bg-zinc-900 focus:outline-none"
            onBlur={() => {
              const next = title.trim();
              if (next && next !== card.title) onChange({ title: next });
            }}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <button
            className="rounded text-xl text-zinc-500 hover:text-zinc-200"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="grid min-w-0 gap-4 overflow-y-auto overflow-x-hidden p-5">
          <div className="grid gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.description")}
            </p>
            <textarea
              className="min-h-24 resize-y rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
              onBlur={() => {
                if (description !== card.description) onChange({ description });
              }}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("board.assignee")}
              </span>
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <Avatar name={memberLabel(assignee)} />
                <select
                  className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
                  onChange={(event) => onChange({ assigneeUserId: event.target.value || null })}
                  value={card.assigneeUserId ?? ""}
                >
                  <option value="">{t("board.unassigned")}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {memberLabel(member)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("board.dueDate")}
              </span>
              <input
                className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                onChange={(event) =>
                  onChange({
                    dueDate: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : null
                  })
                }
                type="date"
                value={dueDateValue}
              />
            </label>
          </div>

          <div className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.linkTo")}
            </span>
            <div className="grid min-w-0 gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2 sm:grid-cols-2">
              <select
                className="w-full min-w-0 truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
                onChange={(event) =>
                  onChange({ sceneId: event.target.value || null, shotId: null })
                }
                value={card.sceneId ?? ""}
              >
                <option value="">{t("board.noScene")}</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {t("board.scene")} {scene.sceneNumber} · {scene.title}
                  </option>
                ))}
              </select>
              <select
                className="w-full min-w-0 truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-50"
                disabled={!card.sceneId || filteredShots.length === 0}
                onChange={(event) => onChange({ shotId: event.target.value || null })}
                value={card.shotId ?? ""}
              >
                <option value="">
                  {!card.sceneId
                    ? t("board.shotNeedsScene")
                    : filteredShots.length === 0
                      ? t("board.noShotsInScene")
                      : t("board.noShot")}
                </option>
                {filteredShots.map((shot) => (
                  <option key={shot.id} value={shot.id}>
                    {t("board.shot")} {shot.shotNumber}
                    {shot.shotType ? ` · ${shot.shotType}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.labels")}
            </p>
            <div className="flex flex-wrap gap-1">
              {labels.length === 0 ? (
                <p className="text-xs text-zinc-500">{t("board.noLabels")}</p>
              ) : null}
              {labels.map((label) => {
                const active = card.labelIds.includes(label.id);
                return (
                  <button
                    className={`rounded px-2 py-1 text-[11px] font-semibold text-white transition ${
                      active ? "" : "opacity-50 hover:opacity-100"
                    }`}
                    key={label.id}
                    onClick={() =>
                      onChange({
                        labelIds: active
                          ? card.labelIds.filter((id) => id !== label.id)
                          : [...card.labelIds, label.id]
                      })
                    }
                    style={{ background: label.color }}
                    type="button"
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("board.checklist")}
              </p>
              {checklistTotal > 0 ? (
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {checklistDone}/{checklistTotal} · {checklistPct}%
                </span>
              ) : null}
            </div>
            {checklistTotal > 0 ? (
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${checklistPct}%` }}
                />
              </div>
            ) : null}
            <ul className="grid gap-1">
              {checklistItems.map((item) => (
                <li
                  className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 hover:border-zinc-800 hover:bg-zinc-900"
                  key={item.id}
                >
                  <input
                    checked={item.done}
                    className="h-4 w-4 accent-emerald-500"
                    onChange={(event) =>
                      updateChecklistItem(item.id, { done: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <input
                    className={`flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-red-600/60 focus:bg-zinc-950 focus:outline-none ${
                      item.done ? "text-zinc-500 line-through" : "text-zinc-100"
                    }`}
                    defaultValue={item.text}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== item.text) updateChecklistItem(item.id, { text: next });
                      if (!next) removeChecklistItem(item.id);
                    }}
                  />
                  <button
                    className="rounded p-1 text-zinc-600 opacity-0 hover:text-red-300 group-hover:opacity-100"
                    onClick={() => removeChecklistItem(item.id)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
                onChange={(event) => setNewChecklistItem(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder={t("board.checklistAddPlaceholder")}
                value={newChecklistItem}
              />
              <button
                className="rounded-md bg-zinc-800 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                disabled={!newChecklistItem.trim()}
                onClick={addChecklistItem}
                type="button"
              >
                {t("board.add")}
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.comments")} ({comments.length})
            </p>
            <ul className="grid gap-2">
              {comments.map((comment) => (
                <li
                  className="group flex min-w-0 gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2"
                  key={comment.id}
                >
                  <Avatar name={comment.authorName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-semibold text-zinc-200">{comment.authorName}</span>
                      <span className="ml-2 text-[10px] text-zinc-500">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-200 [overflow-wrap:anywhere]">
                      {comment.text}
                    </p>
                  </div>
                  <button
                    className="rounded p-1 text-zinc-600 opacity-0 hover:text-red-300 group-hover:opacity-100"
                    onClick={() => void deleteComment(comment.id)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
              {comments.length === 0 ? (
                <li className="text-xs text-zinc-500">{t("board.noComments")}</li>
              ) : null}
            </ul>
            <div className="grid gap-1">
              <textarea
                className="min-h-16 resize-y rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void submitComment();
                  }
                }}
                placeholder={t("board.commentPlaceholder")}
                value={commentDraft}
              />
              <div className="flex justify-end">
                <button
                  className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  disabled={!commentDraft.trim()}
                  onClick={() => void submitComment()}
                  type="button"
                >
                  {t("board.sendComment")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3">
          {canManage ? (
            <button
              className="rounded-md border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40"
              onClick={onDelete}
              type="button"
            >
              {t("board.deleteCard")}
            </button>
          ) : (
            <span />
          )}
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            onClick={onClose}
            type="button"
          >
            {t("board.saveCard")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddColumnModal({
  colorPresets,
  onCancel,
  onConfirm,
  t
}: {
  colorPresets: string[];
  onCancel: () => void;
  onConfirm: (name: string, color: string) => void;
  t: (path: string) => string;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colorPresets[0]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-50">{t("board.addColumn")}</h2>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.name")}
            </span>
            <input
              autoFocus
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <div className="grid gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("board.color")}
            </p>
            <div className="flex gap-2">
              {colorPresets.map((preset) => (
                <button
                  className={`h-6 w-6 rounded-full border-2 ${
                    preset === color ? "border-white" : "border-transparent"
                  }`}
                  key={preset}
                  onClick={() => setColor(preset)}
                  style={{ background: preset }}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            onClick={onCancel}
            type="button"
          >
            {t("scene.cancel")}
          </button>
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim(), color)}
            type="button"
          >
            {t("board.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LabelManagerModal({
  colorPresets,
  labels,
  onClose,
  onCreate,
  onDelete,
  t
}: {
  colorPresets: string[];
  labels: Label[];
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  t: (path: string) => string;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colorPresets[0]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-50">{t("board.manageLabels")}</h2>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-white"
                key={label.id}
                style={{ background: label.color }}
              >
                {label.name}
                <button
                  className="rounded hover:bg-black/30"
                  onClick={() => void onDelete(label.id)}
                  type="button"
                >
                  ×
                </button>
              </span>
            ))}
            {labels.length === 0 ? (
              <p className="text-xs text-zinc-500">{t("board.noLabels")}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <input
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none"
              onChange={(event) => setName(event.target.value)}
              placeholder={t("board.newLabelName")}
              value={name}
            />
            <div className="flex gap-2">
              {colorPresets.map((preset) => (
                <button
                  className={`h-6 w-6 rounded-full border-2 ${
                    preset === color ? "border-white" : "border-transparent"
                  }`}
                  key={preset}
                  onClick={() => setColor(preset)}
                  style={{ background: preset }}
                  type="button"
                />
              ))}
            </div>
            <button
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              disabled={!name.trim()}
              onClick={async () => {
                await onCreate(name.trim(), color);
                setName("");
              }}
              type="button"
            >
              + {t("board.addLabel")}
            </button>
          </div>
        </div>
        <div className="flex justify-end border-t border-zinc-800 px-5 py-3">
          <button
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
            onClick={onClose}
            type="button"
          >
            {t("board.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
