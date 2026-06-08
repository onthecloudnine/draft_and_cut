"use client";

import { useIsMobile } from "@/lib/hooks/use-media-query";
import { MobileSceneDetail } from "./mobile-scene-detail";
import { SceneDetailWorkspace } from "./scene-detail-workspace";

type Props = React.ComponentProps<typeof SceneDetailWorkspace>;

export function SceneDetailRouter(props: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileSceneDetail
        attachments={props.attachments}
        nextScene={props.nextScene ?? null}
        previousScene={props.previousScene ?? null}
        scene={props.scene}
        shots={props.shots}
        videos={props.videos}
      />
    );
  }

  return <SceneDetailWorkspace {...props} />;
}
