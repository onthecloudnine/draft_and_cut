"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import { useI18n } from "@/lib/i18n/client";
import { plainTextToHtml } from "@/components/rich-text-editor";

const RichTextEditor = dynamic(
  () => import("@/components/rich-text-editor").then((mod) => ({ default: mod.RichTextEditor })),
  { ssr: false, loading: () => <div className="min-h-[200px] text-sm text-zinc-500">Cargando editor...</div> }
);
import {
  assetTagCategories,
  productionStages,
  sceneSoundOptions,
  sceneStatuses,
  shotStatuses,
  type AssetTagCategory,
  type ProductionStage,
  type SceneSoundOption,
  type ShotStatus
} from "@/types/domain";

type SceneData = {
  id: string;
  projectId: string;
  sceneNumber: string;
  title: string;
  description: string;
  literaryHeading: string;
  literaryScript: string;
  location: string;
  timeOfDay: string;
  soundOptions: SceneSoundOption[];
  status: string;
  fpsDefault: number;
};

type ShotData = {
  id: string;
  shotNumber: string;
  shotType: string;
  status: ShotStatus;
  description: string;
  action: string;
  camera: string;
  sound: string;
  requiredElements: string[];
  productionNotes: string;
  durationFrames: number | null;
  startFrame: number | null;
  endFrame: number | null;
};

type VideoData = {
  id: string;
  shotId: string | null;
  scope: string;
  versionNumber: number;
  stage: string;
  status: string;
  fileName: string;
  duration: number;
  fps: number;
  resolution: string;
  isFavorite: boolean;
  url: string | null;
};

type AttachmentData = {
  id: string;
  title: string;
  description: string;
  attachmentDate: string;
  fileName: string;
  fileSizeMb: number;
  mimeType: string;
  uploadedByName: string;
  createdAt?: string;
  url: string | null;
};

type ProjectMemberData = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type HumanResourceData = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  stages: ProductionStage[];
  assignedAt?: string;
};

type AssetTagData = {
  id: string;
  tagId: string;
  category: AssetTagCategory;
  name: string;
};

type AssetTagSuggestion = {
  id: string;
  category: AssetTagCategory;
  name: string;
};

type SceneSiblingData = {
  id: string;
  sceneNumber: string;
  title: string;
};

type SceneDetailWorkspaceProps = {
  scene: SceneData;
  shots: ShotData[];
  videos: VideoData[];
  attachments: AttachmentData[];
  projectMembers: ProjectMemberData[];
  humanResources: HumanResourceData[];
  assetTags: AssetTagData[];
  canEditScript: boolean;
  canManageResources: boolean;
  canManageVideos: boolean;
  initialShotId?: string;
  previousScene?: SceneSiblingData | null;
  nextScene?: SceneSiblingData | null;
};

type TopView = "timeline" | "table";
type SidebarTab = "scene" | "script" | "shot" | "team" | "elements" | "files";
type AutosaveStatus = "idle" | "saving" | "saved" | "error";
type MergeRequest = { leftId: string; rightId: string; leftLabel: string; rightLabel: string };

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function splitElements(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}

function framesToTimecode(frames: number | null | undefined, fps: number) {
  if (frames == null || !Number.isFinite(frames) || frames < 0) return "—";
  const safeFps = Math.max(1, Math.round(fps));
  const totalSeconds = frames / safeFps;
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = Math.floor(totalSeconds % 60);
  const ff = Math.round(frames % safeFps);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

function parseTimecode(value: string, fps: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const safeFps = Math.max(1, Math.round(fps));
  let hh = 0;
  let mm = 0;
  let ss = 0;
  let ff = 0;
  if (parts.length === 4) [hh, mm, ss, ff] = parts;
  else if (parts.length === 3) [mm, ss, ff] = parts;
  else if (parts.length === 2) [ss, ff] = parts;
  else if (parts.length === 1) [ff] = parts;
  else return null;
  return hh * 3600 * safeFps + mm * 60 * safeFps + ss * safeFps + ff;
}

function formatDurationSeconds(frames: number | null | undefined, fps: number) {
  if (frames == null) return "—";
  const safeFps = Math.max(1, Math.round(fps));
  return `${(frames / safeFps).toFixed(2)}s`;
}

function nextShotNumberAfter(prev: string | undefined, shots: ShotData[]): string {
  const used = new Set(shots.map((shot) => shot.shotNumber));
  if (prev && /^(\d+)\.(\d+)$/.test(prev)) {
    const [, scenePart, shotPart] = prev.match(/^(\d+)\.(\d+)$/)!;
    let n = Number.parseInt(shotPart, 10);
    for (let i = 0; i < 1000; i += 1) {
      n += 1;
      const candidate = `${scenePart}.${String(n).padStart(shotPart.length, "0")}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  let n = shots.length + 1;
  while (used.has(String(n)) && n < 10_000) n += 1;
  return String(n);
}

function cloneShot(previous: ShotData | null, shots: ShotData[]): ShotData {
  const shotNumber = nextShotNumberAfter(previous?.shotNumber, shots);
  if (!previous) {
    return {
      id: `new-${crypto.randomUUID()}`,
      shotNumber,
      shotType: "",
      status: "animatic",
      description: "",
      action: "",
      camera: "",
      sound: "",
      requiredElements: [],
      productionNotes: "",
      durationFrames: null,
      startFrame: null,
      endFrame: null
    };
  }
  return {
    id: `new-${crypto.randomUUID()}`,
    shotNumber,
    shotType: previous.shotType,
    status: previous.status,
    description: previous.description,
    action: previous.action,
    camera: previous.camera,
    sound: previous.sound,
    requiredElements: [...previous.requiredElements],
    productionNotes: previous.productionNotes,
    durationFrames: previous.durationFrames,
    startFrame: null,
    endFrame: null
  };
}

function compareShotNumbers(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function SceneDetailWorkspace({
  scene: initialScene,
  shots: initialShots,
  videos: initialVideos,
  attachments: initialAttachments,
  projectMembers,
  humanResources: initialHumanResources,
  assetTags: initialAssetTags,
  canEditScript,
  canManageVideos,
  canManageResources,
  initialShotId,
  previousScene = null,
  nextScene = null
}: SceneDetailWorkspaceProps) {
  const { optionLabel, t } = useI18n();

  const sortedInitialShots = useMemo(
    () => [...initialShots].sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber)),
    [initialShots]
  );

  const [scene, setScene] = useState(initialScene);
  const [shots, setShots] = useState<ShotData[]>(sortedInitialShots);
  const [videos, setVideos] = useState(initialVideos);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [humanResources, setHumanResources] = useState(initialHumanResources);
  const [assetTags, setAssetTags] = useState(initialAssetTags);
  const [activeShotId, setActiveShotId] = useState(initialShotId ?? sortedInitialShots[0]?.id ?? "");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [topView, setTopView] = useState<TopView>("timeline");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("scene");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isScriptOverlayOpen, setIsScriptOverlayOpen] = useState(false);
  const [error, setError] = useState("");

  const [tagInputs, setTagInputs] = useState<Record<string, string>>({
    character: "",
    prop: "",
    environment: ""
  });
  const [tagSuggestions, setTagSuggestions] = useState<Record<string, AssetTagSuggestion[]>>({
    character: [],
    prop: [],
    environment: []
  });
  const [selectedResourceUserIds, setSelectedResourceUserIds] = useState<string[]>([]);
  const [selectedResourceStages, setSelectedResourceStages] = useState<ProductionStage[]>([]);
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDate, setAttachmentDate] = useState(todayInputValue());
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState<AssetTagCategory | "">("");
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShot = useMemo(
    () => shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null,
    [shots, activeShotId]
  );
  const availableResourceMembers = projectMembers.filter(
    (member) => !humanResources.some((resource) => resource.userId === member.id)
  );
  const shotVideos = activeShot ? videos.filter((video) => video.shotId === activeShot.id) : [];
  const sceneVideos = videos.filter((video) => video.scope === "scene" || !video.shotId);
  const availableVideos = shotVideos.length > 0 ? shotVideos : sceneVideos.length > 0 ? sceneVideos : videos;
  const activeVideo = useMemo(
    () =>
      availableVideos.find((video) => video.id === selectedVideoId) ??
      availableVideos.find((video) => video.isFavorite) ??
      availableVideos[0] ??
      null,
    [availableVideos, selectedVideoId]
  );

  const stateRef = useRef({ scene, shots });
  stateRef.current = { scene, shots };
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHashRef = useRef<string>("");

  const computeHash = (next: { scene: SceneData; shots: ShotData[] }) =>
    JSON.stringify({
      s: {
        t: next.scene.title,
        d: next.scene.description,
        l: next.scene.location,
        tod: next.scene.timeOfDay,
        so: [...next.scene.soundOptions].sort(),
        st: next.scene.status,
        lh: next.scene.literaryHeading,
        ls: next.scene.literaryScript
      },
      sh: next.shots.map((shot) => ({
        i: shot.id,
        n: shot.shotNumber,
        ty: shot.shotType,
        st: shot.status,
        de: shot.description,
        ac: shot.action,
        ca: shot.camera,
        so: shot.sound,
        re: shot.requiredElements,
        no: shot.productionNotes,
        du: shot.durationFrames,
        sf: shot.startFrame,
        ef: shot.endFrame
      }))
    });

  useEffect(() => {
    savedHashRef.current = computeHash({ scene: initialScene, shots: sortedInitialShots });
  }, [initialScene, sortedInitialShots]);

  const requestAutosave = useCallback(() => {
    if (!canEditScript) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setAutosaveStatus("saving");
    autosaveTimer.current = setTimeout(async () => {
      const snapshot = stateRef.current;
      const hash = computeHash(snapshot);
      if (hash === savedHashRef.current) {
        setAutosaveStatus("saved");
        return;
      }
      try {
        const response = await fetch(`/api/scenes/${snapshot.scene.id}/script`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene: {
              title: snapshot.scene.title || "—",
              description: snapshot.scene.description,
              location: snapshot.scene.location,
              timeOfDay: snapshot.scene.timeOfDay,
              soundOptions: snapshot.scene.soundOptions,
              status: snapshot.scene.status,
              literaryHeading: snapshot.scene.literaryHeading,
              literaryScript: snapshot.scene.literaryScript
            },
            shots: snapshot.shots.map((shot) => ({
              ...shot,
              id: shot.id.startsWith("new-") ? undefined : shot.id
            }))
          })
        });
        if (!response.ok) throw new Error("autosave failed");
        const payload = (await response.json()) as { shots?: ShotData[] };
        if (payload.shots) {
          const sorted = [...payload.shots].sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber));
          setShots(sorted);
          setActiveShotId((current) =>
            sorted.some((shot) => shot.id === current) ? current : sorted[0]?.id ?? ""
          );
          savedHashRef.current = computeHash({ scene: snapshot.scene, shots: sorted });
        } else {
          savedHashRef.current = hash;
        }
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("error");
      }
    }, 700);
  }, [canEditScript]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setIsScriptOverlayOpen((current) => !current);
        return;
      }
      if (event.key === "Escape" && isScriptOverlayOpen) {
        event.preventDefault();
        setIsScriptOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isScriptOverlayOpen]);

  function updateScene(patch: Partial<SceneData>) {
    setScene((current) => ({ ...current, ...patch }));
    requestAutosave();
  }

  function updateShot(shotId: string, patch: Partial<ShotData>) {
    setShots((current) => current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)));
    requestAutosave();
  }

  function toggleSceneSoundOption(option: SceneSoundOption, checked: boolean) {
    setScene((current) => {
      let nextOptions: SceneSoundOption[];
      if (option === "none") {
        nextOptions = checked ? ["none"] : [];
      } else {
        const currentOptions = current.soundOptions.filter((item) => item !== "none");
        nextOptions = checked ? [...currentOptions, option] : currentOptions.filter((item) => item !== option);
      }
      return {
        ...current,
        soundOptions: nextOptions.length > 0 ? Array.from(new Set(nextOptions)) : ["none"]
      };
    });
    requestAutosave();
  }

  function addShotAfter(referenceShot: ShotData | null) {
    if (!canEditScript) return;
    const newShot = cloneShot(referenceShot, shots);
    setShots((current) => {
      if (!referenceShot) return [...current, newShot];
      const idx = current.findIndex((shot) => shot.id === referenceShot.id);
      if (idx < 0) return [...current, newShot];
      return [...current.slice(0, idx + 1), newShot, ...current.slice(idx + 1)];
    });
    setActiveShotId(newShot.id);
    setSidebarTab("shot");
    requestAutosave();
  }

  function removeShot(shotId: string) {
    if (!canEditScript) return;
    if (!window.confirm(t("scene.removeShotConfirm"))) return;
    const nextShots = shots.filter((shot) => shot.id !== shotId);
    setShots(nextShots);
    if (activeShotId === shotId) {
      setActiveShotId(nextShots[0]?.id ?? "");
      setSelectedVideoId("");
    }
    requestAutosave();
  }

  function openMergeRequest(left: ShotData, right: ShotData) {
    if (!canEditScript) return;
    setMergeRequest({
      leftId: left.id,
      rightId: right.id,
      leftLabel: `${left.shotNumber}${left.shotType ? ` · ${left.shotType}` : ""}`,
      rightLabel: `${right.shotNumber}${right.shotType ? ` · ${right.shotType}` : ""}`
    });
  }

  async function confirmMerge(keep: "left" | "right") {
    if (!mergeRequest || isMerging) return;
    if (mergeRequest.leftId.startsWith("new-") || mergeRequest.rightId.startsWith("new-")) {
      setError(t("scene.mergeSaveFirst"));
      setMergeRequest(null);
      return;
    }
    setIsMerging(true);
    try {
      const response = await fetch(`/api/scenes/${scene.id}/shots/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leftId: mergeRequest.leftId,
          rightId: mergeRequest.rightId,
          keep
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("scene.mergeError"));
      }
      const payload = (await response.json()) as { keptShotId: string; shots: ShotData[] };
      const sorted = [...payload.shots].sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber));
      setShots(sorted);
      setActiveShotId(payload.keptShotId);
      savedHashRef.current = computeHash({ scene: stateRef.current.scene, shots: sorted });
      setMergeRequest(null);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : t("scene.mergeError"));
    } finally {
      setIsMerging(false);
    }
  }

  async function deleteActiveVideo() {
    if (!canManageVideos || !activeVideo || isDeletingVideo) return;
    if (!window.confirm(t("scene.deleteVideoConfirm"))) return;
    setError("");
    setIsDeletingVideo(true);
    try {
      const response = await fetch(`/api/videos/${activeVideo.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("scene.deleteVideoError"));
      }
      const payload = (await response.json()) as { nextVideoVersionId: string | null };
      setVideos((current) => current.filter((video) => video.id !== activeVideo.id));
      setSelectedVideoId(payload.nextVideoVersionId ?? "");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("scene.deleteVideoError"));
    } finally {
      setIsDeletingVideo(false);
    }
  }

  async function loadTagSuggestions(category: AssetTagCategory, value: string) {
    const response = await fetch(
      `/api/projects/${scene.projectId}/asset-tags?category=${category}&q=${encodeURIComponent(value)}`
    );
    if (!response.ok) return;
    const payload = (await response.json()) as { tags: AssetTagSuggestion[] };
    setTagSuggestions((current) => ({ ...current, [category]: payload.tags }));
  }

  function updateTagInput(category: AssetTagCategory, value: string) {
    setTagInputs((current) => ({ ...current, [category]: value }));
    void loadTagSuggestions(category, value);
  }

  async function addAssetTag(event: FormEvent<HTMLFormElement>, category: AssetTagCategory) {
    event.preventDefault();
    if (!canEditScript || !tagInputs[category].trim()) return;
    setError("");
    setIsSavingTag(category);
    try {
      const response = await fetch(`/api/scenes/${scene.id}/asset-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name: tagInputs[category] })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("scene.add"));
      }
      const payload = (await response.json()) as { tag: AssetTagData };
      setAssetTags((current) =>
        current.some((tag) => tag.id === payload.tag.id) ? current : [...current, payload.tag]
      );
      setTagInputs((current) => ({ ...current, [category]: "" }));
      setTagSuggestions((current) => ({ ...current, [category]: [] }));
    } catch (tagError) {
      setError(tagError instanceof Error ? tagError.message : t("scene.tagAssigned"));
    } finally {
      setIsSavingTag("");
    }
  }

  async function removeAssetTag(assignmentId: string) {
    if (!canEditScript) return;
    setError("");
    const response = await fetch(`/api/scenes/${scene.id}/asset-tags/${assignmentId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("scene.tagRemoved"));
      return;
    }
    setAssetTags((current) => current.filter((tag) => tag.id !== assignmentId));
  }

  async function addHumanResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageResources || selectedResourceUserIds.length === 0) return;
    setError("");
    setIsSavingResource(true);
    try {
      const response = await fetch(`/api/scenes/${scene.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedResourceUserIds, stages: selectedResourceStages })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("scene.assignResponsible"));
      }
      const payload = (await response.json()) as { resources: HumanResourceData[] };
      setHumanResources((current) => {
        const map = new Map(current.map((item) => [item.id, item]));
        for (const item of payload.resources) map.set(item.id, item);
        return Array.from(map.values());
      });
      setSelectedResourceUserIds([]);
      setSelectedResourceStages([]);
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : t("scene.assignResponsible"));
    } finally {
      setIsSavingResource(false);
    }
  }

  async function updateResourceStages(resourceId: string, stages: ProductionStage[]) {
    if (!canManageResources) return;
    const previous = humanResources;
    setHumanResources((current) =>
      current.map((resource) => (resource.id === resourceId ? { ...resource, stages } : resource))
    );
    try {
      const response = await fetch(`/api/scenes/${scene.id}/resources/${resourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("scene.assignResponsible"));
      }
    } catch (stageError) {
      setHumanResources(previous);
      setError(stageError instanceof Error ? stageError.message : t("scene.assignResponsible"));
    }
  }

  async function removeHumanResource(resourceId: string) {
    if (!canManageResources) return;
    setError("");
    const response = await fetch(`/api/scenes/${scene.id}/resources/${resourceId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("scene.responsibleRemoved"));
      return;
    }
    setHumanResources((current) => current.filter((resource) => resource.id !== resourceId));
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!attachmentFile) {
      setError(t("scene.selectFile"));
      return;
    }
    if (!attachmentTitle.trim()) {
      setError(t("scene.title"));
      return;
    }
    setIsUploadingAttachment(true);
    try {
      const fileSizeMb = Number((attachmentFile.size / 1024 / 1024).toFixed(2));
      const initResponse = await fetch(`/api/scenes/${scene.id}/attachments/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: attachmentTitle,
          description: attachmentDescription,
          attachmentDate: new Date(`${attachmentDate}T00:00:00`).toISOString(),
          fileName: attachmentFile.name,
          mimeType: attachmentFile.type || "application/octet-stream",
          fileSizeMb
        })
      });
      if (!initResponse.ok) {
        const payload = await initResponse.json();
        throw new Error(payload.error ?? t("scene.addAttachment"));
      }
      const initPayload = await initResponse.json();
      const uploadResponse = await fetch(initPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": attachmentFile.type || "application/octet-stream",
          ...(initPayload.uploadHeaders ?? {})
        },
        body: attachmentFile
      });
      if (!uploadResponse.ok) {
        throw new Error(`S3 rechazo la subida del adjunto. (${uploadResponse.status})`);
      }
      const completeResponse = await fetch(
        `/api/scenes/${scene.id}/attachments/${initPayload.uploadId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploaded: true, etag: uploadResponse.headers.get("etag") ?? undefined })
        }
      );
      if (!completeResponse.ok) {
        const payload = await completeResponse.json();
        throw new Error(payload.error ?? t("scene.addAttachment"));
      }
      const completePayload = (await completeResponse.json()) as { attachment: AttachmentData };
      setAttachments((current) => [completePayload.attachment, ...current]);
      setAttachmentTitle("");
      setAttachmentDescription("");
      setAttachmentDate(todayInputValue());
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("scene.uploading"));
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <SceneHeader
        autosaveStatus={autosaveStatus}
        activeVideo={activeVideo}
        canManageVideos={canManageVideos}
        isDeletingVideo={isDeletingVideo}
        nextScene={nextScene}
        onDeleteVideo={deleteActiveVideo}
        previousScene={previousScene}
        scene={scene}
        t={t}
      />

      <TopTabs t={t} value={topView} onChange={setTopView} />

      <div className="flex min-h-0 flex-1 flex-col">
        {topView === "timeline" ? (
          <TimelineView
            activeShot={activeShot}
            activeVideo={activeVideo}
            availableVideos={availableVideos}
            assetTags={assetTags}
            attachments={attachments}
            attachmentDate={attachmentDate}
            attachmentDescription={attachmentDescription}
            attachmentFile={attachmentFile}
            attachmentTitle={attachmentTitle}
            availableResourceMembers={availableResourceMembers}
            canEditScript={canEditScript}
            canManageResources={canManageResources}
            canManageVideos={canManageVideos}
            fileInputRef={fileInputRef}
            humanResources={humanResources}
            isDeletingVideo={isDeletingVideo}
            isSavingResource={isSavingResource}
            isSavingTag={isSavingTag}
            isUploadingAttachment={isUploadingAttachment}
            onAddAssetTag={addAssetTag}
            onAddHumanResource={addHumanResource}
            onAddShotAfter={addShotAfter}
            onDeleteVideo={deleteActiveVideo}
            onOpenMerge={openMergeRequest}
            onOpenScriptOverlay={() => setIsScriptOverlayOpen(true)}
            onRemoveAssetTag={removeAssetTag}
            onRemoveHumanResource={removeHumanResource}
            onRemoveShot={removeShot}
            onSelectShot={setActiveShotId}
            onSelectVideo={setSelectedVideoId}
            onTagInputChange={updateTagInput}
            onUpdateResourceStages={updateResourceStages}
            onUpdateScene={updateScene}
            onUpdateShot={updateShot}
            onUploadAttachment={uploadAttachment}
            optionLabel={optionLabel}
            scene={scene}
            selectedResourceStages={selectedResourceStages}
            selectedResourceUserIds={selectedResourceUserIds}
            setAttachmentDate={setAttachmentDate}
            setAttachmentDescription={setAttachmentDescription}
            setAttachmentFile={setAttachmentFile}
            setAttachmentTitle={setAttachmentTitle}
            setSelectedResourceStages={setSelectedResourceStages}
            setSelectedResourceUserIds={setSelectedResourceUserIds}
            setSidebarTab={setSidebarTab}
            shots={shots}
            sidebarTab={sidebarTab}
            tagInputs={tagInputs}
            tagSuggestions={tagSuggestions}
            t={t}
            toggleSceneSoundOption={toggleSceneSoundOption}
          />
        ) : (
          <TableView
            canEditScript={canEditScript}
            onAddShotAfter={addShotAfter}
            onRemoveShot={removeShot}
            onUpdateShot={updateShot}
            optionLabel={optionLabel}
            scene={scene}
            shots={shots}
            t={t}
          />
        )}
      </div>

      {error ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-red-600/60 bg-red-950/90 px-4 py-2 text-sm text-red-100 shadow-lg">
          <div className="flex items-center gap-3">
            <span>{error}</span>
            <button
              className="text-red-200 hover:text-white"
              onClick={() => setError("")}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {mergeRequest ? (
        <MergeModal
          isSubmitting={isMerging}
          onCancel={() => setMergeRequest(null)}
          onConfirm={confirmMerge}
          request={mergeRequest}
          t={t}
        />
      ) : null}

      {isScriptOverlayOpen ? (
        <ScriptOverlay
          canEdit={canEditScript}
          onChange={(value) => updateScene({ literaryScript: value })}
          onClose={() => setIsScriptOverlayOpen(false)}
          scene={scene}
          t={t}
        />
      ) : null}
    </div>
  );
}

function SceneHeader({
  autosaveStatus,
  activeVideo,
  canManageVideos,
  isDeletingVideo,
  nextScene,
  onDeleteVideo,
  previousScene,
  scene,
  t
}: {
  autosaveStatus: AutosaveStatus;
  activeVideo: VideoData | null;
  canManageVideos: boolean;
  isDeletingVideo: boolean;
  nextScene: SceneSiblingData | null;
  onDeleteVideo: () => void;
  previousScene: SceneSiblingData | null;
  scene: SceneData;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
            href={`/projects/${scene.projectId}`}
          >
            ← {t("scene.backToProject")}
          </Link>
          <div className="hidden h-6 w-px bg-zinc-800 sm:block" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
              {t("scene.scene")} {scene.sceneNumber}
            </p>
            <h1 className="text-base font-semibold text-zinc-50 sm:text-lg">{scene.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutosaveBadge status={autosaveStatus} t={t} />
          {previousScene ? (
            <Link
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              href={`/scenes/${previousScene.id}`}
              title={previousScene.title}
            >
              <span>←</span>
              <span>{t("scene.previousScene", { sceneNumber: previousScene.sceneNumber })}</span>
            </Link>
          ) : null}
          {nextScene ? (
            <Link
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              href={`/scenes/${nextScene.id}`}
              title={nextScene.title}
            >
              <span>{t("scene.nextScene", { sceneNumber: nextScene.sceneNumber })}</span>
              <span>→</span>
            </Link>
          ) : null}
          <a
            className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            href={`/api/scenes/${scene.id}/assets/download`}
          >
            {t("scene.downloadAssetsZip")}
          </a>
          <Link
            className="inline-flex h-8 items-center justify-center rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500"
            href={`/upload?projectId=${scene.projectId}&sceneId=${scene.id}`}
          >
            {t("scene.uploadVideo")}
          </Link>
          {canManageVideos && activeVideo ? (
            <button
              className="inline-flex h-8 items-center justify-center rounded-md border border-red-900/70 px-3 text-xs font-medium text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeletingVideo}
              onClick={onDeleteVideo}
              type="button"
            >
              {isDeletingVideo ? t("scene.deletingVideo") : t("scene.deleteVideo")}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function AutosaveBadge({
  status,
  t
}: {
  status: AutosaveStatus;
  t: (path: string) => string;
}) {
  const map: Record<AutosaveStatus, { label: string; cls: string }> = {
    idle: { label: "", cls: "" },
    saving: { label: t("scene.autosaveSaving"), cls: "text-amber-400" },
    saved: { label: t("scene.autosaveSaved"), cls: "text-emerald-400" },
    error: { label: t("scene.autosaveError"), cls: "text-red-400" }
  };
  const data = map[status];
  if (!data.label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${data.cls}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {data.label}
    </span>
  );
}

function TopTabs({
  onChange,
  t,
  value
}: {
  onChange: (value: TopView) => void;
  t: (path: string) => string;
  value: TopView;
}) {
  const tabs: { key: TopView; label: string }[] = [
    { key: "timeline", label: t("scene.viewTimeline") },
    { key: "table", label: t("scene.viewTable") }
  ];
  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-5 sm:px-7">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              className={[
                "relative px-3 py-2.5 text-sm font-medium transition",
                active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"
              ].join(" ")}
              key={tab.key}
              onClick={() => onChange(tab.key)}
              type="button"
            >
              {tab.label}
              {active ? (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-red-500" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TimelineViewProps = {
  activeShot: ShotData | null;
  activeVideo: VideoData | null;
  availableVideos: VideoData[];
  assetTags: AssetTagData[];
  attachments: AttachmentData[];
  attachmentDate: string;
  attachmentDescription: string;
  attachmentFile: File | null;
  attachmentTitle: string;
  availableResourceMembers: ProjectMemberData[];
  canEditScript: boolean;
  canManageResources: boolean;
  canManageVideos: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  humanResources: HumanResourceData[];
  isDeletingVideo: boolean;
  isSavingResource: boolean;
  isSavingTag: AssetTagCategory | "";
  isUploadingAttachment: boolean;
  onAddAssetTag: (event: FormEvent<HTMLFormElement>, category: AssetTagCategory) => void;
  onAddHumanResource: (event: FormEvent<HTMLFormElement>) => void;
  onAddShotAfter: (shot: ShotData | null) => void;
  onDeleteVideo: () => void;
  onOpenMerge: (left: ShotData, right: ShotData) => void;
  onOpenScriptOverlay: () => void;
  onRemoveAssetTag: (id: string) => void;
  onRemoveHumanResource: (id: string) => void;
  onRemoveShot: (id: string) => void;
  onSelectShot: (id: string) => void;
  onSelectVideo: (id: string) => void;
  onTagInputChange: (category: AssetTagCategory, value: string) => void;
  onUpdateResourceStages: (id: string, stages: ProductionStage[]) => void;
  onUpdateScene: (patch: Partial<SceneData>) => void;
  onUpdateShot: (id: string, patch: Partial<ShotData>) => void;
  onUploadAttachment: (event: FormEvent<HTMLFormElement>) => void;
  optionLabel: (group: string, value: string) => string;
  scene: SceneData;
  selectedResourceStages: ProductionStage[];
  selectedResourceUserIds: string[];
  setAttachmentDate: (value: string) => void;
  setAttachmentDescription: (value: string) => void;
  setAttachmentFile: (value: File | null) => void;
  setAttachmentTitle: (value: string) => void;
  setSelectedResourceStages: React.Dispatch<React.SetStateAction<ProductionStage[]>>;
  setSelectedResourceUserIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSidebarTab: (tab: SidebarTab) => void;
  shots: ShotData[];
  sidebarTab: SidebarTab;
  tagInputs: Record<string, string>;
  tagSuggestions: Record<string, AssetTagSuggestion[]>;
  t: (path: string, replacements?: Record<string, string | number>) => string;
  toggleSceneSoundOption: (option: SceneSoundOption, checked: boolean) => void;
};

function TimelineView(props: TimelineViewProps) {
  const {
    activeShot,
    activeVideo,
    availableVideos,
    canEditScript,
    onAddShotAfter,
    onOpenMerge,
    onSelectShot,
    onSelectVideo,
    optionLabel,
    scene,
    setSidebarTab,
    shots,
    sidebarTab,
    t
  } = props;

  const activeThumbRef = useRef<HTMLLIElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fps = Math.max(1, scene.fpsDefault);

  const activeShotIndex = useMemo(
    () => (activeShot ? shots.findIndex((shot) => shot.id === activeShot.id) : -1),
    [shots, activeShot?.id]
  );

  useEffect(() => {
    if (!activeThumbRef.current) return;
    activeThumbRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeShot?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeShot) return;
    if (typeof activeShot.startFrame !== "number") return;
    const targetSeconds = activeShot.startFrame / fps;
    const seek = () => {
      if (Math.abs(video.currentTime - targetSeconds) < 0.05) return;
      try {
        video.currentTime = targetSeconds;
      } catch {
        /* ignore — happens before metadata is loaded */
      }
    };
    if (video.readyState >= 1) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
      return () => video.removeEventListener("loadedmetadata", seek);
    }
  }, [activeShot?.id, activeShot?.startFrame, fps, activeVideo?.id]);

  useEffect(() => {
    setPlaybackSeconds(0);
    setDuration(0);
    setIsPlaying(false);
  }, [activeVideo?.id]);

  useEffect(() => {
    if (isScrubbingRef.current) return;
    if (!isPlaying) return;
    const playbackFrames = playbackSeconds * fps;
    const matched = shots.find(
      (shot) =>
        typeof shot.startFrame === "number" &&
        typeof shot.endFrame === "number" &&
        playbackFrames >= shot.startFrame &&
        playbackFrames < shot.endFrame
    );
    if (matched && matched.id !== activeShot?.id) {
      onSelectShot(matched.id);
    }
  }, [playbackSeconds, isPlaying, shots, fps, activeShot?.id, onSelectShot]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    } else {
      video.pause();
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(seconds, video.duration || seconds));
    try {
      video.currentTime = clamped;
    } catch {
      /* ignore */
    }
  }, []);

  const goPrevShot = useCallback(() => {
    if (activeShotIndex < 0) return;
    if (activeShotIndex === 0) {
      seekTo(0);
      return;
    }
    onSelectShot(shots[activeShotIndex - 1].id);
  }, [activeShotIndex, shots, onSelectShot, seekTo]);

  const goNextShot = useCallback(() => {
    if (activeShotIndex < 0 || activeShotIndex >= shots.length - 1) return;
    onSelectShot(shots[activeShotIndex + 1].id);
  }, [activeShotIndex, shots, onSelectShot]);

  const handleSelectShotFromThumb = useCallback(
    (shotId: string) => {
      onSelectShot(shotId);
      setSidebarTab("shot");
    },
    [onSelectShot, setSidebarTab]
  );

  const stepFrame = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused) video.pause();
      seekTo(video.currentTime + delta / fps);
    },
    [fps, seekTo]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen?.().catch(() => {
        /* ignore */
      });
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === playerContainerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      switch (event.key) {
        case " ":
        case "Spacebar":
          event.preventDefault();
          togglePlayback();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) goPrevShot();
          else stepFrame(-1);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) goNextShot();
          else stepFrame(1);
          break;
        case "m":
        case "M":
          event.preventDefault();
          toggleMute();
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlayback, stepFrame, goPrevShot, goNextShot, toggleMute, toggleFullscreen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col bg-black" ref={playerContainerRef}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2 text-xs text-zinc-400 sm:px-6">
            <div className="min-w-0">
              {activeVideo ? (
                <span>
                  <span className="font-semibold text-zinc-200">
                    {optionLabel("productionStages", activeVideo.stage)} v{activeVideo.versionNumber}
                  </span>
                  <span className="text-zinc-500"> · {activeVideo.resolution}</span>
                </span>
              ) : (
                <span className="text-zinc-500">{t("scene.noVideoSelection")}</span>
              )}
            </div>
            {availableVideos.length > 1 ? (
              <select
                className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-100"
                onChange={(event) => onSelectVideo(event.target.value)}
                value={activeVideo?.id ?? ""}
              >
                {availableVideos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {optionLabel("productionStages", video.stage)} v{video.versionNumber}{" "}
                    {video.shotId ? "(shot)" : `(${t("scene.scene").toLowerCase()})`}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
            {activeVideo?.url ? (
              <video
                ref={videoRef}
                key={activeVideo.id}
                className="max-h-full max-w-full cursor-pointer rounded-md bg-black shadow-2xl shadow-black/60"
                onClick={togglePlayback}
                onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
                onLoadedMetadata={(event) => {
                  setDuration(event.currentTarget.duration || 0);
                  setIsMuted(event.currentTarget.muted);
                }}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={(event) => {
                  const next = event.currentTarget.currentTime;
                  setPlaybackSeconds((prev) => (Math.abs(next - prev) >= 0.066 ? next : prev));
                }}
                onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
                playsInline
                src={activeVideo.url}
              />
            ) : (
              <NoVideoPlaceholder t={t} />
            )}
          </div>
          {activeVideo?.url ? (
            <VideoTransport
              activeShot={activeShot}
              duration={duration}
              fps={fps}
              isFullscreen={isFullscreen}
              isMuted={isMuted}
              isPlaying={isPlaying}
              onNextShot={goNextShot}
              onPrevShot={goPrevShot}
              onSeek={seekTo}
              onStepFrame={stepFrame}
              onToggleFullscreen={toggleFullscreen}
              onToggleMute={toggleMute}
              onTogglePlay={togglePlayback}
              playbackSeconds={playbackSeconds}
              shots={shots}
              t={t}
            />
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-zinc-800 bg-zinc-900 lg:w-[380px] lg:border-l xl:w-[420px]">
          <SidebarTabs activeShot={activeShot} onChange={setSidebarTab} t={t} value={sidebarTab} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sidebarTab === "scene" ? <SceneTab {...props} /> : null}
            {sidebarTab === "script" ? <ScriptTab {...props} /> : null}
            {sidebarTab === "shot" ? <ShotTab {...props} /> : null}
            {sidebarTab === "team" ? <TeamTab {...props} /> : null}
            {sidebarTab === "elements" ? <ElementsTab {...props} /> : null}
            {sidebarTab === "files" ? <FilesTab {...props} /> : null}
          </div>
        </aside>
      </section>

      <section className="shrink-0 border-t border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3 sm:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("scene.shotsTimeline")}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span>{shots.length} {t("scene.shotsCount")}</span>
            {canEditScript ? (
              <button
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800"
                onClick={() => onAddShotAfter(activeShot ?? shots[shots.length - 1] ?? null)}
                type="button"
              >
                + {t("scene.addShot")}
              </button>
            ) : null}
          </div>
        </div>
        <ul className="flex items-stretch gap-0 overflow-x-auto overflow-y-hidden px-3 pb-4 pt-2">
          {shots.map((shot, idx) => {
            const isActive = shot.id === activeShot?.id;
            const nextShot = shots[idx + 1];
            const hasRange =
              typeof shot.startFrame === "number" &&
              typeof shot.endFrame === "number" &&
              shot.endFrame > shot.startFrame;
            const playbackFrames = playbackSeconds * fps;
            const playbackProgress =
              isActive && hasRange
                ? Math.max(
                    0,
                    Math.min(1, (playbackFrames - (shot.startFrame ?? 0)) / Math.max(1, (shot.endFrame ?? 0) - (shot.startFrame ?? 0)))
                  )
                : 0;
            return (
              <li className="flex shrink-0 items-stretch" key={shot.id} ref={isActive ? activeThumbRef : null}>
                <ShotThumbnail
                  fps={fps}
                  hasRange={hasRange}
                  isActive={isActive}
                  onSeek={seekTo}
                  onSelect={handleSelectShotFromThumb}
                  optionLabel={optionLabel}
                  playbackProgress={playbackProgress}
                  scrubbingRef={isScrubbingRef}
                  scene={scene}
                  shot={shot}
                />
                {nextShot ? (
                  <MergeGap
                    canEdit={canEditScript}
                    left={shot}
                    onMerge={onOpenMerge}
                    right={nextShot}
                    t={t}
                  />
                ) : null}
              </li>
            );
          })}
          {shots.length === 0 ? (
            <li className="flex h-24 w-full items-center justify-center px-5 text-sm text-zinc-500">
              {t("scene.emptyShots")}
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function VideoTransport({
  activeShot,
  duration,
  fps,
  isFullscreen,
  isMuted,
  isPlaying,
  onNextShot,
  onPrevShot,
  onSeek,
  onStepFrame,
  onToggleFullscreen,
  onToggleMute,
  onTogglePlay,
  playbackSeconds,
  shots,
  t
}: {
  activeShot: ShotData | null;
  duration: number;
  fps: number;
  isFullscreen: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  onNextShot: () => void;
  onPrevShot: () => void;
  onSeek: (seconds: number) => void;
  onStepFrame: (delta: number) => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
  playbackSeconds: number;
  shots: ShotData[];
  t: (path: string) => string;
}) {
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const safeDuration = duration > 0 ? duration : 0;
  const progress = safeDuration > 0 ? Math.max(0, Math.min(1, playbackSeconds / safeDuration)) : 0;

  const activeIndex = activeShot ? shots.findIndex((shot) => shot.id === activeShot.id) : -1;
  const prevDisabled = activeIndex <= 0;
  const nextDisabled = activeIndex < 0 || activeIndex >= shots.length - 1;

  const activeRange =
    activeShot &&
    typeof activeShot.startFrame === "number" &&
    typeof activeShot.endFrame === "number" &&
    safeDuration > 0
      ? {
          left: Math.max(0, Math.min(1, activeShot.startFrame / fps / safeDuration)),
          width: Math.max(
            0,
            Math.min(1, (activeShot.endFrame - activeShot.startFrame) / fps / safeDuration)
          )
        }
      : null;

  const seekFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = scrubberRef.current;
    if (!track || safeDuration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    onSeek(ratio * safeDuration);
  };

  return (
    <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-3 py-2 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <TransportButton
            disabled={prevDisabled}
            label={t("scene.transportPrev")}
            onClick={onPrevShot}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h2v14H6zM20 5v14L9 12z" />
            </svg>
          </TransportButton>
          <TransportButton label={t("scene.transportStepBack")} onClick={() => onStepFrame(-1)}>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 5v14L2 12zM22 5v14l-7-7z" />
            </svg>
          </TransportButton>
          <TransportButton
            label={isPlaying ? t("scene.transportPause") : t("scene.transportPlay")}
            onClick={onTogglePlay}
            primary
          >
            {isPlaying ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </TransportButton>
          <TransportButton label={t("scene.transportStepForward")} onClick={() => onStepFrame(1)}>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 5v14l11-7zM2 5v14l7-7z" />
            </svg>
          </TransportButton>
          <TransportButton
            disabled={nextDisabled}
            label={t("scene.transportNext")}
            onClick={onNextShot}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
            </svg>
          </TransportButton>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] tabular-nums">
          <span className="font-semibold text-zinc-100">
            {framesToTimecode(Math.round(playbackSeconds * fps), fps)}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{framesToTimecode(Math.round(safeDuration * fps), fps)}</span>
        </div>

        <div
          className="relative h-2 flex-1 cursor-pointer touch-none select-none rounded-full bg-zinc-800"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsScrubbing(true);
            seekFromEvent(event);
          }}
          onPointerMove={(event) => {
            if (!isScrubbing) return;
            seekFromEvent(event);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setIsScrubbing(false);
          }}
          ref={scrubberRef}
        >
          {activeRange ? (
            <div
              aria-hidden
              className="absolute top-0 h-full bg-red-600/25"
              style={{ left: `${activeRange.left * 100}%`, width: `${activeRange.width * 100}%` }}
            />
          ) : null}
          {safeDuration > 0
            ? shots.map((shot) => {
                if (typeof shot.startFrame !== "number") return null;
                const left = (shot.startFrame / fps / safeDuration) * 100;
                if (left < 0 || left > 100) return null;
                return (
                  <div
                    aria-hidden
                    className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-zinc-600"
                    key={shot.id}
                    style={{ left: `${left}%` }}
                  />
                );
              })
            : null}
          <div
            aria-hidden
            className="absolute left-0 top-0 h-full rounded-l-full bg-red-500"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            aria-hidden
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-300 bg-white shadow"
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-1">
          <TransportButton
            label={isMuted ? t("scene.transportUnmute") : t("scene.transportMute")}
            onClick={onToggleMute}
          >
            {isMuted ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M11 5L6 9H3v6h3l5 4z" />
                <path d="M17 9l4 6" />
                <path d="M21 9l-4 6" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M11 5L6 9H3v6h3l5 4z" />
                <path d="M16 9a4 4 0 0 1 0 6" />
                <path d="M19 6a8 8 0 0 1 0 12" />
              </svg>
            )}
          </TransportButton>
          <TransportButton
            label={isFullscreen ? t("scene.transportExitFullscreen") : t("scene.transportFullscreen")}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M9 4v5H4" />
                <path d="M15 4v5h5" />
                <path d="M9 20v-5H4" />
                <path d="M15 20v-5h5" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M4 9V4h5" />
                <path d="M20 9V4h-5" />
                <path d="M4 15v5h5" />
                <path d="M20 15v5h-5" />
              </svg>
            )}
          </TransportButton>
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  children,
  disabled,
  label,
  onClick,
  primary
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={[
        "flex h-9 w-9 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40",
        primary
          ? "bg-red-600 text-white hover:bg-red-500"
          : "border border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

type ShotThumbnailProps = {
  fps: number;
  hasRange: boolean;
  isActive: boolean;
  onSeek: (seconds: number) => void;
  onSelect: (shotId: string) => void;
  optionLabel: (group: string, value: string) => string;
  playbackProgress: number;
  scrubbingRef: React.MutableRefObject<boolean>;
  scene: SceneData;
  shot: ShotData;
};

const ShotThumbnail = memo(function ShotThumbnail({
  fps,
  hasRange,
  isActive,
  onSeek,
  onSelect,
  optionLabel,
  playbackProgress,
  scrubbingRef,
  scene,
  shot
}: ShotThumbnailProps) {
  const handleSelect = useCallback(() => onSelect(shot.id), [onSelect, shot.id]);
  const localScrubbingRef = useRef(false);

  const seekFromClientX = (clientX: number, target: HTMLElement) => {
    if (typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const seconds = (shot.startFrame + ratio * (shot.endFrame - shot.startFrame)) / fps;
    onSeek(seconds);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive) {
      handleSelect();
      return;
    }
    if (!hasRange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    localScrubbingRef.current = true;
    scrubbingRef.current = true;
    seekFromClientX(event.clientX, event.currentTarget);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!localScrubbingRef.current) return;
    seekFromClientX(event.clientX, event.currentTarget);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!localScrubbingRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    localScrubbingRef.current = false;
    scrubbingRef.current = false;
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!localScrubbingRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    localScrubbingRef.current = false;
    scrubbingRef.current = false;
  };

  return (
    <div
      className={[
        "group flex w-40 shrink-0 flex-col overflow-hidden rounded-md border transition",
        isActive
          ? "border-red-500/80 ring-2 ring-red-500/40"
          : "border-zinc-800 hover:border-zinc-600"
      ].join(" ")}
    >
      <div
        className={[
          "relative flex h-20 w-full select-none items-end overflow-hidden bg-zinc-900 p-2 touch-none",
          isActive && hasRange ? "cursor-ew-resize" : "cursor-pointer"
        ].join(" ")}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">
          {framesToTimecode(shot.startFrame, scene.fpsDefault)}
        </span>
        {isActive && hasRange ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 bg-red-500/10"
              style={{ width: `${playbackProgress * 100}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
              style={{ left: `${playbackProgress * 100}%` }}
            >
              <div className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-red-500" />
            </div>
          </>
        ) : null}
        <p className="pointer-events-none relative z-10 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          {shot.shotNumber}
        </p>
      </div>
      <button
        className="flex min-h-12 flex-col gap-0.5 bg-zinc-900 px-2 py-1.5 text-left hover:bg-zinc-800"
        onClick={handleSelect}
        type="button"
      >
        <p className="truncate text-[11px] font-medium text-zinc-100">{shot.shotType || "—"}</p>
        <p className="truncate text-[10px] text-zinc-500">
          {optionLabel("shotStatuses", shot.status)}
          <span className="text-zinc-600"> · {formatDurationSeconds(shot.durationFrames, scene.fpsDefault)}</span>
        </p>
      </button>
    </div>
  );
}, areShotThumbnailPropsEqual);

function areShotThumbnailPropsEqual(prev: ShotThumbnailProps, next: ShotThumbnailProps) {
  if (prev.isActive !== next.isActive) return false;
  if (next.isActive && prev.playbackProgress !== next.playbackProgress) return false;
  if (prev.hasRange !== next.hasRange) return false;
  if (prev.fps !== next.fps) return false;
  if (prev.onSeek !== next.onSeek) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.optionLabel !== next.optionLabel) return false;
  if (prev.scrubbingRef !== next.scrubbingRef) return false;
  if (prev.scene.fpsDefault !== next.scene.fpsDefault) return false;
  const a = prev.shot;
  const b = next.shot;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.shotNumber === b.shotNumber &&
    a.shotType === b.shotType &&
    a.status === b.status &&
    a.startFrame === b.startFrame &&
    a.endFrame === b.endFrame &&
    a.durationFrames === b.durationFrames
  );
}

function MergeGap({
  canEdit,
  left,
  onMerge,
  right,
  t
}: {
  canEdit: boolean;
  left: ShotData;
  onMerge: (left: ShotData, right: ShotData) => void;
  right: ShotData;
  t: (path: string) => string;
}) {
  if (!canEdit) {
    return <div className="w-2" />;
  }
  return (
    <div className="group relative flex w-4 items-center justify-center">
      <button
        aria-label={t("scene.mergeShots")}
        className="invisible flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 hover:border-red-500 hover:bg-red-600/20 hover:text-red-300"
        onClick={() => onMerge(left, right)}
        title={t("scene.mergeShots")}
        type="button"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
          <path d="M8 7l-4 5 4 5" />
          <path d="M16 7l4 5-4 5" />
          <path d="M4 12h16" />
        </svg>
      </button>
    </div>
  );
}

function NoVideoPlaceholder({ t }: { t: (path: string) => string }) {
  return (
    <div className="flex max-w-md flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-950/60 px-8 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path d="M5 5h11l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
          <path d="M10 11l5 3-5 3z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-200">{t("scene.noPreviewTitle")}</p>
      <p className="mt-1 text-xs text-zinc-500">{t("scene.noPreviewBody")}</p>
    </div>
  );
}

function SidebarTabs({
  activeShot,
  onChange,
  t,
  value
}: {
  activeShot: ShotData | null;
  onChange: (tab: SidebarTab) => void;
  t: (path: string, replacements?: Record<string, string | number>) => string;
  value: SidebarTab;
}) {
  const tabs: { key: SidebarTab; label: string }[] = [
    { key: "scene", label: t("scene.tabScene") },
    { key: "script", label: t("scene.tabScript") },
    { key: "shot", label: activeShot ? t("scene.tabShotN", { shotNumber: activeShot.shotNumber }) : t("scene.tabShot") },
    { key: "team", label: t("scene.tabTeam") },
    { key: "elements", label: t("scene.tabElements") },
    { key: "files", label: t("scene.tabFiles") }
  ];
  return (
    <div className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-zinc-800 px-2">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            className={[
              "relative shrink-0 px-3 py-2.5 text-[12px] font-medium transition",
              active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"
            ].join(" ")}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            type="button"
          >
            {tab.label}
            {active ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-red-500" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</span>;
}

function TextInput({
  disabled,
  onChange,
  value,
  placeholder,
  type = "text"
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-sm text-zinc-100 focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      value={value}
    />
  );
}

function TextArea({
  disabled,
  onChange,
  value,
  rows = 3
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="w-full min-w-0 resize-none overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm leading-5 text-zinc-100 focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      style={{ minHeight: `${rows * 20 + 18}px` }}
      value={value}
    />
  );
}

function SceneTab(props: TimelineViewProps) {
  const { canEditScript, optionLabel, onUpdateScene, scene, t, toggleSceneSoundOption } = props;
  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <FieldLabel>{t("scene.number")}</FieldLabel>
          <TextInput disabled value={scene.sceneNumber} onChange={() => {}} />
        </div>
        <div className="grid min-w-0 gap-2">
          <FieldLabel>{t("scene.status")}</FieldLabel>
          <select
            className="h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 disabled:opacity-60"
            disabled={!canEditScript}
            onChange={(event) => onUpdateScene({ status: event.target.value })}
            value={scene.status}
          >
            {sceneStatuses.map((item) => (
              <option key={item} value={item}>
                {optionLabel("sceneStatuses", item)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.title")}</FieldLabel>
        <TextInput
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ title: value })}
          value={scene.title}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.location")}</FieldLabel>
        <TextInput
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ location: value })}
          value={scene.location}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.timeOfDay")}</FieldLabel>
        <TextInput
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ timeOfDay: value })}
          value={scene.timeOfDay}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.dramaticIntent")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ description: value })}
          rows={4}
          value={scene.description}
        />
      </div>
      <fieldset className="grid gap-2">
        <FieldLabel>{t("scene.sound")}</FieldLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {sceneSoundOptions.map((option) => (
            <label
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300"
              key={option}
            >
              <input
                checked={scene.soundOptions.includes(option)}
                className="h-3.5 w-3.5 accent-red-600"
                disabled={!canEditScript}
                onChange={(event) => toggleSceneSoundOption(option, event.target.checked)}
                type="checkbox"
              />
              {optionLabel("sceneSoundOptions", option)}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ScriptTab(props: TimelineViewProps) {
  const { canEditScript, onOpenScriptOverlay, onUpdateScene, scene, t } = props;
  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <div className="grid gap-2">
        <FieldLabel>{t("scene.literaryHeading")}</FieldLabel>
        <TextInput
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ literaryHeading: value })}
          value={scene.literaryHeading}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{t("scene.literaryScript")}</FieldLabel>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-900"
            onClick={onOpenScriptOverlay}
            title={t("scene.scriptShortcutHint")}
            type="button"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
            {t("scene.openInOverlay")}
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 text-[9px] font-mono text-zinc-400">G</kbd>
          </button>
        </div>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateScene({ literaryScript: value })}
          rows={12}
          value={scene.literaryScript}
        />
      </div>
    </div>
  );
}

function ShotTab(props: TimelineViewProps) {
  const { activeShot, canEditScript, onRemoveShot, onUpdateShot, optionLabel, scene, t } = props;

  if (!activeShot) {
    return (
      <div className="p-5 text-sm text-zinc-500">{t("scene.emptyShots")}</div>
    );
  }

  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <FieldLabel>{t("scene.number")}</FieldLabel>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{activeShot.shotNumber}</p>
        </div>
        {canEditScript ? (
          <button
            className="rounded-md border border-red-900/70 px-2.5 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-950/30"
            onClick={() => onRemoveShot(activeShot.id)}
            type="button"
          >
            {t("scene.remove")}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <FieldLabel>{t("scene.number")}</FieldLabel>
          <TextInput
            disabled={!canEditScript}
            onChange={(value) => onUpdateShot(activeShot.id, { shotNumber: value })}
            value={activeShot.shotNumber}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <FieldLabel>{t("scene.type")}</FieldLabel>
          <TextInput
            disabled={!canEditScript}
            onChange={(value) => onUpdateShot(activeShot.id, { shotType: value })}
            value={activeShot.shotType}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <FieldLabel>{t("scene.status")}</FieldLabel>
        <select
          className="h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 disabled:opacity-60"
          disabled={!canEditScript}
          onChange={(event) => onUpdateShot(activeShot.id, { status: event.target.value as ShotStatus })}
          value={activeShot.status}
        >
          {shotStatuses.map((item) => (
            <option key={item} value={item}>
              {optionLabel("shotStatuses", item)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="grid min-w-0 gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t("scene.time")} · {scene.fpsDefault} fps
        </legend>
        <div className="grid min-w-0 grid-cols-3 gap-2">
          <TimecodeField
            disabled={!canEditScript}
            fps={scene.fpsDefault}
            label={t("scene.startTc")}
            onChange={(frames) => onUpdateShot(activeShot.id, { startFrame: frames })}
            value={activeShot.startFrame}
          />
          <TimecodeField
            disabled={!canEditScript}
            fps={scene.fpsDefault}
            label={t("scene.endTc")}
            onChange={(frames) => onUpdateShot(activeShot.id, { endFrame: frames })}
            value={activeShot.endFrame}
          />
          <TimecodeField
            disabled={!canEditScript}
            fps={scene.fpsDefault}
            label={t("scene.durationTc")}
            onChange={(frames) => onUpdateShot(activeShot.id, { durationFrames: frames })}
            value={activeShot.durationFrames}
          />
        </div>
      </fieldset>

      <div className="grid gap-2">
        <FieldLabel>{t("scene.description")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { description: value })}
          value={activeShot.description}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.action")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { action: value })}
          value={activeShot.action}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.camera")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { camera: value })}
          value={activeShot.camera}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.soundTransition")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { sound: value })}
          value={activeShot.sound}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.requiredElements")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { requiredElements: splitElements(value) })}
          value={activeShot.requiredElements.join("\n")}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel>{t("scene.productionNotes")}</FieldLabel>
        <TextArea
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { productionNotes: value })}
          value={activeShot.productionNotes}
        />
      </div>
    </div>
  );
}

function TimecodeField({
  disabled,
  fps,
  label,
  onChange,
  value
}: {
  disabled?: boolean;
  fps: number;
  label: string;
  onChange: (frames: number | null) => void;
  value: number | null;
}) {
  const [draft, setDraft] = useState(framesToTimecode(value, fps));
  useEffect(() => {
    setDraft(framesToTimecode(value, fps));
  }, [value, fps]);
  return (
    <label className="grid min-w-0 gap-1">
      <span className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        className="h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 text-center text-[11px] tabular-nums text-zinc-100 focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:opacity-60"
        disabled={disabled}
        onBlur={() => {
          const parsed = parseTimecode(draft, fps);
          if (parsed !== value) onChange(parsed);
          else setDraft(framesToTimecode(value, fps));
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="00:00:00:00"
        size={11}
        value={draft}
      />
    </label>
  );
}

function TeamTab(props: TimelineViewProps) {
  const {
    availableResourceMembers,
    canManageResources,
    humanResources,
    isSavingResource,
    onAddHumanResource,
    onRemoveHumanResource,
    onUpdateResourceStages,
    optionLabel,
    selectedResourceStages,
    selectedResourceUserIds,
    setSelectedResourceStages,
    setSelectedResourceUserIds,
    t
  } = props;

  return (
    <div className="grid gap-4 p-4 sm:p-5">
      {canManageResources ? (
        <form className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3" onSubmit={onAddHumanResource}>
          <FieldLabel>{t("scene.responsible")}</FieldLabel>
          {availableResourceMembers.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("scene.noAvailableMembers")}</p>
          ) : (
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 p-1">
              {availableResourceMembers.map((member) => {
                const checked = selectedResourceUserIds.includes(member.id);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-900"
                    key={member.id}
                  >
                    <input
                      checked={checked}
                      className="h-3.5 w-3.5 accent-red-600"
                      disabled={isSavingResource}
                      onChange={(event) =>
                        setSelectedResourceUserIds((current) =>
                          event.target.checked
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id)
                        )
                      }
                      type="checkbox"
                    />
                    <span className="flex-1 truncate text-xs text-zinc-200">{member.name}</span>
                    <span className="text-[10px] uppercase text-zinc-500">{member.role}</span>
                  </label>
                );
              })}
            </div>
          )}
          <FieldLabel>{t("scene.stagesPreset")}</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {productionStages.map((stage) => {
              const selected = selectedResourceStages.includes(stage);
              return (
                <button
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                    selected
                      ? "border-red-600 bg-red-600/15 text-zinc-50"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
                  }`}
                  key={stage}
                  onClick={() =>
                    setSelectedResourceStages((current) =>
                      current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage]
                    )
                  }
                  type="button"
                >
                  {optionLabel("productionStages", stage)}
                </button>
              );
            })}
          </div>
          <button
            className="h-9 rounded-md bg-red-600 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            disabled={selectedResourceUserIds.length === 0 || isSavingResource}
            type="submit"
          >
            {isSavingResource
              ? t("scene.assigning")
              : t("scene.assignResponsibles", { count: selectedResourceUserIds.length })}
          </button>
        </form>
      ) : null}

      <div className="grid gap-2">
        {humanResources.map((resource) => (
          <article className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs" key={resource.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-50">{resource.name}</p>
                <p className="mt-0.5 text-zinc-500">{resource.email}</p>
                <p className="mt-1 text-[10px] font-medium uppercase text-red-400">{resource.role}</p>
              </div>
              {canManageResources ? (
                <button
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-900"
                  onClick={() => void onRemoveHumanResource(resource.id)}
                  type="button"
                >
                  {t("scene.remove")}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {productionStages.map((stage) => {
                const active = resource.stages.includes(stage);
                return (
                  <button
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition ${
                      active
                        ? "border-red-600 bg-red-600/15 text-zinc-50"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
                    }`}
                    disabled={!canManageResources}
                    key={stage}
                    onClick={() => {
                      const next = active
                        ? resource.stages.filter((item) => item !== stage)
                        : [...resource.stages, stage];
                      void onUpdateResourceStages(resource.id, next);
                    }}
                    type="button"
                  >
                    {optionLabel("productionStages", stage)}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
        {humanResources.length === 0 ? (
          <p className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
            {t("scene.noResponsibles")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ElementsTab(props: TimelineViewProps) {
  const {
    assetTags,
    canEditScript,
    isSavingTag,
    onAddAssetTag,
    onRemoveAssetTag,
    onTagInputChange,
    optionLabel,
    tagInputs,
    tagSuggestions,
    t
  } = props;
  return (
    <div className="grid gap-4 p-4 sm:p-5">
      {assetTagCategories.map((category) => {
        const categoryTags = assetTags.filter((tag) => tag.category === category);
        const datalistId = `${category}-asset-tags-sidebar`;
        return (
          <div className="grid gap-2" key={category}>
            <FieldLabel>{optionLabel("assetTagCategories", category)}</FieldLabel>
            {canEditScript ? (
              <form className="flex gap-2" onSubmit={(event) => void onAddAssetTag(event, category)}>
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-sm text-zinc-100"
                  list={datalistId}
                  onChange={(event) => onTagInputChange(category, event.target.value)}
                  placeholder={t("scene.writeOrSelect")}
                  value={tagInputs[category]}
                />
                <datalist id={datalistId}>
                  {tagSuggestions[category].map((tag) => (
                    <option key={tag.id} value={tag.name} />
                  ))}
                </datalist>
                <button
                  className="h-9 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                  disabled={isSavingTag === category || !tagInputs[category].trim()}
                  type="submit"
                >
                  {t("scene.add")}
                </button>
              </form>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {categoryTags.map((tag) => (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                  key={tag.id}
                >
                  {tag.name}
                  {canEditScript ? (
                    <button
                      className="text-[10px] font-semibold text-zinc-500 hover:text-red-300"
                      onClick={() => void onRemoveAssetTag(tag.id)}
                      type="button"
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))}
              {categoryTags.length === 0 ? (
                <p className="text-xs text-zinc-500">{t("scene.noTags")}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilesTab(props: TimelineViewProps) {
  const {
    attachmentDate,
    attachmentDescription,
    attachmentFile,
    attachmentTitle,
    attachments,
    fileInputRef,
    isUploadingAttachment,
    onUploadAttachment,
    setAttachmentDate,
    setAttachmentDescription,
    setAttachmentFile,
    setAttachmentTitle,
    t
  } = props;
  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <form className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3" onSubmit={onUploadAttachment}>
        <FieldLabel>{t("scene.title")}</FieldLabel>
        <TextInput onChange={setAttachmentTitle} value={attachmentTitle} />
        <FieldLabel>{t("scene.attachmentDate")}</FieldLabel>
        <TextInput onChange={setAttachmentDate} type="date" value={attachmentDate} />
        <FieldLabel>{t("scene.description")}</FieldLabel>
        <TextArea onChange={setAttachmentDescription} value={attachmentDescription} />
        <button
          className="rounded-md border border-dashed border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-300 hover:border-red-700 hover:bg-zinc-900"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {attachmentFile ? attachmentFile.name : t("scene.selectFile")}
        </button>
        <input
          className="hidden"
          onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="h-9 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          disabled={isUploadingAttachment}
          type="submit"
        >
          {isUploadingAttachment ? t("scene.uploading") : t("scene.addAttachment")}
        </button>
      </form>
      <div className="grid gap-2">
        {attachments.map((attachment) => (
          <article className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs" key={attachment.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-zinc-50">{attachment.title}</p>
                <p className="mt-0.5 text-zinc-500">
                  {formatDate(attachment.attachmentDate)} · {attachment.uploadedByName}
                </p>
              </div>
              <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {attachment.fileSizeMb} MB
              </span>
            </div>
            {attachment.description ? (
              <p className="mt-1.5 text-zinc-400">{attachment.description}</p>
            ) : null}
            {attachment.url ? (
              <a
                className="mt-2 inline-flex text-[11px] font-medium text-red-300 hover:text-red-200"
                href={attachment.url}
                rel="noreferrer"
                target="_blank"
              >
                {t("scene.openFile", { fileName: attachment.fileName })}
              </a>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">{attachment.fileName}</p>
            )}
          </article>
        ))}
        {attachments.length === 0 ? (
          <p className="text-xs text-zinc-500">{t("scene.noAttachments")}</p>
        ) : null}
      </div>
    </div>
  );
}

function TableView({
  canEditScript,
  onAddShotAfter,
  onRemoveShot,
  onUpdateShot,
  optionLabel,
  scene,
  shots,
  t
}: {
  canEditScript: boolean;
  onAddShotAfter: (shot: ShotData | null) => void;
  onRemoveShot: (id: string) => void;
  onUpdateShot: (id: string, patch: Partial<ShotData>) => void;
  optionLabel: (group: string, value: string) => string;
  scene: SceneData;
  shots: ShotData[];
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t("scene.tableSubtitle", { count: shots.length })}
        </p>
        {canEditScript ? (
          <button
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            onClick={() => onAddShotAfter(shots[shots.length - 1] ?? null)}
            type="button"
          >
            + {t("scene.addShot")}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 sm:px-7">
        <table className="w-full min-w-[1400px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-950">
            <tr>
              {[
                t("scene.number"),
                t("scene.type"),
                t("scene.status"),
                t("scene.startTc"),
                t("scene.endTc"),
                t("scene.durationTc"),
                t("scene.description"),
                t("scene.action"),
                t("scene.camera"),
                t("scene.soundTransition"),
                t("scene.requiredElements"),
                t("scene.productionNotes"),
                ""
              ].map((label, idx) => (
                <th
                  className="border-b border-zinc-800 bg-zinc-900/80 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                  key={idx}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shots.map((shot) => (
              <tr className="hover:bg-zinc-900/30" key={shot.id}>
                <Cell>
                  <CellInput
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { shotNumber: value })}
                    value={shot.shotNumber}
                    width="w-20"
                  />
                </Cell>
                <Cell>
                  <CellInput
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { shotType: value })}
                    value={shot.shotType}
                    width="w-40"
                  />
                </Cell>
                <Cell>
                  <select
                    className="h-7 w-32 rounded border border-zinc-800 bg-zinc-950 px-1 text-xs text-zinc-100 disabled:opacity-60"
                    disabled={!canEditScript}
                    onChange={(event) => onUpdateShot(shot.id, { status: event.target.value as ShotStatus })}
                    value={shot.status}
                  >
                    {shotStatuses.map((item) => (
                      <option key={item} value={item}>
                        {optionLabel("shotStatuses", item)}
                      </option>
                    ))}
                  </select>
                </Cell>
                <Cell>
                  <TimecodeCell
                    disabled={!canEditScript}
                    fps={scene.fpsDefault}
                    onCommit={(frames) => onUpdateShot(shot.id, { startFrame: frames })}
                    value={shot.startFrame}
                  />
                </Cell>
                <Cell>
                  <TimecodeCell
                    disabled={!canEditScript}
                    fps={scene.fpsDefault}
                    onCommit={(frames) => onUpdateShot(shot.id, { endFrame: frames })}
                    value={shot.endFrame}
                  />
                </Cell>
                <Cell>
                  <TimecodeCell
                    disabled={!canEditScript}
                    fps={scene.fpsDefault}
                    onCommit={(frames) => onUpdateShot(shot.id, { durationFrames: frames })}
                    value={shot.durationFrames}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { description: value })}
                    value={shot.description}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { action: value })}
                    value={shot.action}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { camera: value })}
                    value={shot.camera}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { sound: value })}
                    value={shot.sound}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { requiredElements: splitElements(value) })}
                    value={shot.requiredElements.join("\n")}
                  />
                </Cell>
                <Cell>
                  <CellTextarea
                    disabled={!canEditScript}
                    onCommit={(value) => onUpdateShot(shot.id, { productionNotes: value })}
                    value={shot.productionNotes}
                  />
                </Cell>
                <Cell>
                  {canEditScript ? (
                    <div className="flex gap-1">
                      <button
                        className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                        onClick={() => onAddShotAfter(shot)}
                        title={t("scene.addShot")}
                        type="button"
                      >
                        +
                      </button>
                      <button
                        className="rounded border border-red-900/70 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-950/30"
                        onClick={() => onRemoveShot(shot.id)}
                        title={t("scene.remove")}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </Cell>
              </tr>
            ))}
            {shots.length === 0 ? (
              <tr>
                <td className="border-b border-zinc-800 px-3 py-6 text-center text-zinc-500" colSpan={13}>
                  {t("scene.emptyShots")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-zinc-900 bg-zinc-950/40 px-2 py-1.5 align-top">{children}</td>;
}

function CellInput({
  disabled,
  onCommit,
  value,
  width = "w-32"
}: {
  disabled?: boolean;
  onCommit: (value: string) => void;
  value: string;
  width?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`h-7 ${width} rounded border border-transparent bg-transparent px-1 text-xs text-zinc-100 focus:border-zinc-700 focus:bg-zinc-950 focus:outline-none disabled:opacity-60`}
      disabled={disabled}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      value={draft}
    />
  );
}

function CellTextarea({
  disabled,
  onCommit,
  value
}: {
  disabled?: boolean;
  onCommit: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      className="min-h-7 w-72 resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-xs leading-4 text-zinc-100 focus:border-zinc-700 focus:bg-zinc-950 focus:outline-none disabled:opacity-60"
      disabled={disabled}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onChange={(event) => setDraft(event.target.value)}
      rows={2}
      value={draft}
    />
  );
}

function TimecodeCell({
  disabled,
  fps,
  onCommit,
  value
}: {
  disabled?: boolean;
  fps: number;
  onCommit: (frames: number | null) => void;
  value: number | null;
}) {
  const [draft, setDraft] = useState(framesToTimecode(value, fps));
  useEffect(() => setDraft(framesToTimecode(value, fps)), [value, fps]);
  return (
    <input
      className="h-7 w-28 rounded border border-transparent bg-transparent px-1 text-xs tabular-nums text-zinc-100 focus:border-zinc-700 focus:bg-zinc-950 focus:outline-none disabled:opacity-60"
      disabled={disabled}
      onBlur={() => {
        const parsed = parseTimecode(draft, fps);
        if (parsed !== value) onCommit(parsed);
        else setDraft(framesToTimecode(value, fps));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      placeholder="00:00:00:00"
      value={draft}
    />
  );
}

function MergeModal({
  isSubmitting,
  onCancel,
  onConfirm,
  request,
  t
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (keep: "left" | "right") => void;
  request: MergeRequest;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">{t("scene.mergeShots")}</h2>
          <p className="mt-1 text-xs text-zinc-400">{t("scene.mergeHelp")}</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <button
            className="flex flex-col items-start gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-4 text-left text-sm transition hover:border-red-600 hover:bg-red-600/10 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => onConfirm("left")}
            type="button"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("scene.mergeKeepLeft")}
            </span>
            <span className="font-semibold text-zinc-100">{request.leftLabel}</span>
            <span className="text-[11px] text-zinc-500">{t("scene.mergeKeepHint")}</span>
          </button>
          <button
            className="flex flex-col items-start gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-4 text-left text-sm transition hover:border-red-600 hover:bg-red-600/10 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => onConfirm("right")}
            type="button"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("scene.mergeKeepRight")}
            </span>
            <span className="font-semibold text-zinc-100">{request.rightLabel}</span>
            <span className="text-[11px] text-zinc-500">{t("scene.mergeKeepHint")}</span>
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            {t("scene.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptOverlay({
  canEdit,
  onChange,
  onClose,
  scene,
  t
}: {
  canEdit: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  scene: SceneData;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
              {t("scene.scene")} {scene.sceneNumber} · {t("scene.literaryScript")}
              {canEdit ? <span className="ml-2 text-zinc-500">· {t("scene.adminEditEnabled")}</span> : null}
            </p>
            {scene.literaryHeading ? (
              <h2 className="mt-1 truncate text-base font-semibold text-zinc-50">{scene.literaryHeading}</h2>
            ) : scene.title ? (
              <h2 className="mt-1 truncate text-base font-semibold text-zinc-50">{scene.title}</h2>
            ) : null}
          </div>
          <button
            aria-label={t("scene.cancel")}
            className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={onClose}
            type="button"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          {canEdit ? (
            <RichTextEditor
              editable
              onChange={onChange}
              placeholder={t("scene.missingLiteraryScript")}
              value={scene.literaryScript}
            />
          ) : scene.literaryScript ? (
            <div
              className="prose-editor"
              dangerouslySetInnerHTML={{ __html: plainTextToHtml(scene.literaryScript) }}
            />
          ) : (
            <p className="text-sm italic text-zinc-500">{t("scene.missingLiteraryScript")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900/40 px-6 py-2 text-[11px] text-zinc-500">
          <span>{t("scene.scriptShortcutHint")}</span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">G</kbd>
            <span>·</span>
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">Esc</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
