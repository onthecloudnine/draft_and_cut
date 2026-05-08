import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getSceneDetailData } from "@/lib/data/scene-detail";
import { SceneDetailWorkspace } from "./scene-detail-workspace";

export default async function SceneDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ shotId?: string }>;
}) {
  const { sceneId } = await params;
  const { shotId } = await searchParams;
  const user = await requireUser();

  const data = await getSceneDetailData(sceneId);

  if (!data) {
    notFound();
  }

  const role = await assertProjectPermission(user.id, data.scene.projectId, "project:read");

  return (
    <SceneDetailWorkspace
      attachments={data.attachments}
      canEditScript={role === "admin"}
      canManageResources={role === "admin"}
      humanResources={data.humanResources}
      initialShotId={shotId}
      projectMembers={data.projectMembers}
      scene={data.scene}
      shots={data.shots}
      videos={data.videos}
    />
  );
}
