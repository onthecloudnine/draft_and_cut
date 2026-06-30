import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { getSceneDetailData } from "@/lib/data/scene-detail";
import { SceneDetailRouter } from "./scene-detail-router";

export default async function SceneDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ shotId?: string }>;
}) {
  const { sceneId } = await params;
  if (!sceneId || !/^[a-f0-9]{24}$/i.test(sceneId)) {
    notFound();
  }
  const { shotId } = await searchParams;
  const user = await requireUser();

  const data = await getSceneDetailData(sceneId);

  if (!data) {
    notFound();
  }

  const role = await assertProjectPermission(user.id, data.scene.projectId, "project:read");

  return (
    <SceneDetailRouter
      attachments={data.attachments}
      assetTags={data.assetTags}
      canEditScript={role === "admin"}
      canManageResources={role === "admin"}
      canManageVideos={role === "admin"}
      humanResources={data.humanResources}
      initialShotId={shotId}
      nextScene={data.nextScene}
      previousScene={data.previousScene}
      siblingScenes={data.siblingScenes}
      projectMembers={data.projectMembers}
      scene={data.scene}
      shots={data.shots}
      videos={data.videos}
      storyboardFrames={data.storyboardFrames}
      audioVersions={data.audioVersions}
      shotStageStates={data.shotStageStates}
      artReferences={data.artReferences}
    />
  );
}
