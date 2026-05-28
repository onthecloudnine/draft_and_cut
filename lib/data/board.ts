import { connectDb } from "@/lib/db/mongoose";
import { BoardColumn } from "@/models/BoardColumn";
import { BoardLabel } from "@/models/BoardLabel";
import { BoardCard } from "@/models/BoardCard";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";

const DEFAULT_COLUMNS = [
  { name: "Pendiente", color: "#64748b" },
  { name: "En curso", color: "#3b82f6" },
  { name: "Revisión", color: "#a855f7" },
  { name: "Listo", color: "#22c55e" }
];

async function ensureDefaultColumns(projectId: string) {
  const existing = await BoardColumn.countDocuments({ projectId });
  if (existing > 0) return;
  await BoardColumn.insertMany(
    DEFAULT_COLUMNS.map((column, index) => ({
      projectId,
      name: column.name,
      color: column.color,
      sortOrder: index
    }))
  );
}

export type BoardSnapshot = Awaited<ReturnType<typeof getBoardSnapshot>>;

export async function getBoardSnapshot(projectId: string) {
  await connectDb();
  await ensureDefaultColumns(projectId);

  const [columns, labels, cards, memberships, scenes] = await Promise.all([
    BoardColumn.find({ projectId }).sort({ sortOrder: 1 }).lean(),
    BoardLabel.find({ projectId }).sort({ name: 1 }).lean(),
    BoardCard.find({ projectId }).sort({ columnId: 1, sortOrder: 1 }).lean(),
    ProjectMembership.find({ projectId }).lean(),
    Scene.find({ projectId }).select("_id sceneNumber title").sort({ sceneNumber: 1 }).lean()
  ]);

  const memberIds = memberships.map((membership) => membership.userId);
  const assigneeIds = cards
    .map((card) => card.assigneeUserId)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const userIds = Array.from(new Set([...memberIds, ...assigneeIds].map((id) => String(id))));
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const sceneIds = scenes.map((scene) => scene._id);
  const shots = await Shot.find({ sceneId: { $in: sceneIds } })
    .select("_id sceneId shotNumber shotType")
    .lean();

  return {
    columns: columns.map((column) => ({
      id: String(column._id),
      name: column.name,
      color: column.color ?? "",
      sortOrder: column.sortOrder ?? 0
    })),
    labels: labels.map((label) => ({
      id: String(label._id),
      name: label.name,
      color: label.color ?? "#3b82f6"
    })),
    cards: cards.map((card) => ({
      id: String(card._id),
      columnId: String(card.columnId),
      title: card.title,
      description: card.description ?? "",
      assigneeUserId: card.assigneeUserId ? String(card.assigneeUserId) : null,
      assigneeName: card.assigneeUserId
        ? userById.get(String(card.assigneeUserId))?.name ?? null
        : null,
      dueDate: card.dueDate ? card.dueDate.toISOString() : null,
      sceneId: card.sceneId ? String(card.sceneId) : null,
      shotId: card.shotId ? String(card.shotId) : null,
      labelIds: (card.labelIds ?? []).map((id: unknown) => String(id)),
      checklist: (card.checklist ?? []).map((item: { id?: string; text?: string; done?: boolean }) => ({
        id: String(item.id ?? ""),
        text: String(item.text ?? ""),
        done: Boolean(item.done)
      })),
      sortOrder: card.sortOrder ?? 0
    })),
    members: memberships.map((membership) => {
      const user = userById.get(String(membership.userId));
      return {
        id: String(membership.userId),
        name: user?.name ?? "",
        email: user?.email ?? "",
        role: membership.role
      };
    }),
    scenes: scenes.map((scene) => ({
      id: String(scene._id),
      sceneNumber: scene.sceneNumber,
      title: scene.title
    })),
    shots: shots.map((shot) => ({
      id: String(shot._id),
      sceneId: String(shot.sceneId),
      shotNumber: shot.shotNumber,
      shotType: shot.shotType ?? ""
    }))
  };
}
