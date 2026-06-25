"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AudioTracksPanel } from "./audio-tracks-panel";
import { uploadShotVideo } from "@/lib/uploads/client";
import type { AudioVersionData, StoryboardFrameData } from "./phase-types";

export type ShotStageStateData = {
  id: string;
  shotId: string;
  stage: string;
  reviewStatus: string;
  assignees: string[];
};

// Colores por estado de revisión (validados con el usuario).
const SCENE_STATUS_COLORS: Record<string, string> = {
  draft: "#9ca3af",
  in_progress: "#f59e0b",
  in_review: "#3b82f6",
  approved: "#22c55e",
  archived: "#64748b"
};

const RichTextEditor = dynamic(
  () => import("@/components/rich-text-editor").then((mod) => ({ default: mod.RichTextEditor })),
  { ssr: false, loading: () => <div className="min-h-[200px] text-sm text-muted">Cargando editor...</div> }
);
import {
  assetTagCategories,
  sceneSoundOptions,
  sceneStages,
  sceneStatuses,
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
  stage: string;
  status: string;
  fpsDefault: number;
};

type ShotData = {
  id: string;
  shotNumber: string;
  title: string;
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
  shotId: string | null;
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
  shotId: string | null;
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
  storyboardFrames: StoryboardFrameData[];
  audioVersions: AudioVersionData[];
  shotStageStates: ShotStageStateData[];
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
  siblingScenes?: SceneSiblingData[];
};

// Sound/audio panel hidden for now (pending product decision). Flip to true to
// re-enable the per-stem audio tracks below the player.
const SHOW_AUDIO_PANEL = false;

type TopView = "timeline" | "table" | "scene" | "script";
type TimelineTool = "select" | "blade";
type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const DRAFT_STORAGE_PREFIX = "scene-draft:";

function readLocalDraft(sceneId: string): { scene: SceneData; shots: ShotData[]; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${sceneId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.ts === "number" &&
      parsed.scene &&
      Array.isArray(parsed.shots)
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalDraft(sceneId: string, scene: SceneData, shots: ShotData[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${sceneId}`,
      JSON.stringify({ scene, shots, ts: Date.now() })
    );
  } catch {
    /* quota or disabled */
  }
}

function clearLocalDraft(sceneId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${sceneId}`);
  } catch {
    /* ignore */
  }
}
type MergeRequest = {
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
  leftStartFrame: number | null;
  leftEndFrame: number | null;
  leftDurationFrames: number | null;
  rightStartFrame: number | null;
  rightEndFrame: number | null;
  rightDurationFrames: number | null;
};

type AddShotRequest = {
  afterShotId: string | null;
  defaultStartFrame: number;
};

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


const PIXELS_PER_SECOND = 50;
const MIN_THUMB_WIDTH_PX = 90;

function compareShotNumbers(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function SceneDetailWorkspace({
  scene: initialScene,
  shots: initialShots,
  videos: initialVideos,
  audioVersions,
  shotStageStates,
  attachments: initialAttachments,
  projectMembers,
  humanResources: initialHumanResources,
  assetTags: initialAssetTags,
  canEditScript,
  canManageVideos,
  canManageResources,
  initialShotId,
  previousScene = null,
  nextScene = null,
  siblingScenes = []
}: SceneDetailWorkspaceProps) {
  const { optionLabel, t } = useI18n();

  // Timeline order follows the cut positions (startFrame); shotNumber is only a
  // tie-breaker. This keeps a freshly-split shot in its place instead of jumping
  // to the end on reload (a split assigns a high shotNumber but a mid startFrame).
  const sortedInitialShots = useMemo(
    () =>
      [...initialShots].sort((a, b) => {
        const af = typeof a.startFrame === "number" ? a.startFrame : Number.POSITIVE_INFINITY;
        const bf = typeof b.startFrame === "number" ? b.startFrame : Number.POSITIVE_INFINITY;
        return af !== bf ? af - bf : compareShotNumbers(a.shotNumber, b.shotNumber);
      }),
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
  const [timelineTool, setTimelineTool] = useState<TimelineTool>("select");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);
  const [addShotRequest, setAddShotRequest] = useState<AddShotRequest | null>(null);
  const [isDeleteSceneOpen, setIsDeleteSceneOpen] = useState(false);
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
  const saveQueueRef = useRef<{ inFlight: boolean; pending: boolean }>({ inFlight: false, pending: false });
  const syncToServerRef = useRef<() => Promise<void>>(async () => {});

  type HistorySnapshot = { scene: SceneData; shots: ShotData[] };
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[]; lastAt: number }>({
    past: [],
    future: [],
    lastAt: 0
  });
  const [historyVersion, setHistoryVersion] = useState(0);

  function cloneHistorySnapshot(snap: HistorySnapshot): HistorySnapshot {
    return {
      scene: { ...snap.scene, soundOptions: [...snap.scene.soundOptions] },
      shots: snap.shots.map((s) => ({ ...s, requiredElements: [...s.requiredElements] }))
    };
  }

  const recordHistory = useCallback((options?: { immediate?: boolean }) => {
    const now = Date.now();
    if (!options?.immediate && now - historyRef.current.lastAt < 600) return;
    historyRef.current.past.push(cloneHistorySnapshot(stateRef.current));
    if (historyRef.current.past.length > 100) historyRef.current.past.shift();
    historyRef.current.future = [];
    historyRef.current.lastAt = now;
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop()!;
    h.future.push(cloneHistorySnapshot(stateRef.current));
    h.lastAt = 0;
    setScene(prev.scene);
    setShots(prev.shots);
    setActiveShotId((current) => (prev.shots.some((s) => s.id === current) ? current : prev.shots[0]?.id ?? ""));
    setHistoryVersion((v) => v + 1);
    requestAutosaveRef.current();
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.pop()!;
    h.past.push(cloneHistorySnapshot(stateRef.current));
    h.lastAt = 0;
    setScene(next.scene);
    setShots(next.shots);
    setActiveShotId((current) => (next.shots.some((s) => s.id === current) ? current : next.shots[0]?.id ?? ""));
    setHistoryVersion((v) => v + 1);
    requestAutosaveRef.current();
  }, []);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  void historyVersion; // re-derive canUndo/canRedo whenever the version changes

  const requestAutosaveRef = useRef<() => void>(() => {});

  const computeHash = (next: { scene: SceneData; shots: ShotData[] }) =>
    JSON.stringify({
      s: {
        t: next.scene.title,
        d: next.scene.description,
        l: next.scene.location,
        tod: next.scene.timeOfDay,
        so: [...next.scene.soundOptions].sort(),
        sg: next.scene.stage,
        st: next.scene.status,
        lh: next.scene.literaryHeading,
        ls: next.scene.literaryScript
      },
      sh: next.shots.map((shot) => ({
        i: shot.id,
        n: shot.shotNumber,
        tt: shot.title,
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

  const syncToServer = useCallback(async () => {
    if (!canEditScript) return;
    if (saveQueueRef.current.inFlight) {
      saveQueueRef.current.pending = true;
      return;
    }
    const snapshot = stateRef.current;
    const hash = computeHash(snapshot);
    if (hash === savedHashRef.current) {
      setAutosaveStatus("saved");
      return;
    }
    saveQueueRef.current.inFlight = true;
    setAutosaveStatus("saving");
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
            stage: snapshot.scene.stage,
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
        // Map temporary "new-*" ids in the sent snapshot to the real ids the server assigned.
        // Match by shotNumber, which is unique within a scene. Importantly we do NOT replace
        // any other field — the user may have kept typing during the in-flight fetch.
        const sentNewByNumber = new Map<string, string>();
        for (const sent of snapshot.shots) {
          if (sent.id.startsWith("new-")) sentNewByNumber.set(sent.shotNumber, sent.id);
        }
        const tempToReal = new Map<string, string>();
        for (const serverShot of payload.shots) {
          const tempId = sentNewByNumber.get(serverShot.shotNumber);
          if (tempId) tempToReal.set(tempId, serverShot.id);
        }
        if (tempToReal.size > 0) {
          setShots((current) =>
            current.map((shot) => {
              const real = tempToReal.get(shot.id);
              return real ? { ...shot, id: real } : shot;
            })
          );
          setActiveShotId((current) => tempToReal.get(current) ?? current);
        }
        // Persisted hash reflects the snapshot we just sent with ids remapped, so the next
        // autosave correctly detects whether the user has diverged from the server state.
        const persistedShots = snapshot.shots.map((shot) => {
          const real = tempToReal.get(shot.id);
          return real ? { ...shot, id: real } : shot;
        });
        savedHashRef.current = computeHash({ scene: snapshot.scene, shots: persistedShots });
      } else {
        savedHashRef.current = hash;
      }
      setLastSavedAt(Date.now());
      setAutosaveStatus("saved");
      clearLocalDraft(snapshot.scene.id);
    } catch {
      setAutosaveStatus("error");
    } finally {
      saveQueueRef.current.inFlight = false;
      if (saveQueueRef.current.pending) {
        saveQueueRef.current.pending = false;
        // Re-run with latest state; do not await to avoid stacking.
        void syncToServerRef.current();
      }
    }
  }, [canEditScript]);

  useEffect(() => {
    syncToServerRef.current = syncToServer;
  }, [syncToServer]);

  const requestAutosave = useCallback(() => {
    if (!canEditScript) return;
    const snapshot = stateRef.current;
    writeLocalDraft(snapshot.scene.id, snapshot.scene, snapshot.shots);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setAutosaveStatus("saving");
    autosaveTimer.current = setTimeout(() => {
      void syncToServerRef.current();
    }, 700);
  }, [canEditScript]);

  useEffect(() => {
    requestAutosaveRef.current = requestAutosave;
  }, [requestAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const draft = readLocalDraft(initialScene.id);
    if (!draft) return;
    const serverHash = computeHash({ scene: initialScene, shots: sortedInitialShots });
    const draftHash = computeHash({ scene: draft.scene, shots: draft.shots });
    if (draftHash === serverHash) {
      clearLocalDraft(initialScene.id);
      return;
    }
    setScene(draft.scene);
    setShots([...draft.shots].sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber)));
    savedHashRef.current = serverHash;
    setAutosaveStatus("saving");
    autosaveTimer.current = setTimeout(() => {
      void syncToServerRef.current();
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target != null &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        if (inField) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (event.key === "y" || event.key === "Y")) {
        if (inField) return;
        event.preventDefault();
        redo();
        return;
      }
      if (inField) return;
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
  }, [isScriptOverlayOpen, undo, redo]);

  function updateScene(patch: Partial<SceneData>) {
    recordHistory();
    setScene((current) => ({ ...current, ...patch }));
    requestAutosave();
  }

  function updateShot(shotId: string, patch: Partial<ShotData>) {
    recordHistory();
    setShots((current) => current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)));
    requestAutosave();
  }

  function toggleSceneSoundOption(option: SceneSoundOption, checked: boolean) {
    recordHistory({ immediate: true });
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
    const refEnd =
      referenceShot && typeof referenceShot.endFrame === "number"
        ? referenceShot.endFrame
        : referenceShot && typeof referenceShot.startFrame === "number"
          ? referenceShot.startFrame
          : 0;
    setAddShotRequest({
      afterShotId: referenceShot?.id ?? null,
      defaultStartFrame: Math.max(0, refEnd)
    });
  }

  function confirmAddShot(data: {
    startFrame: number;
    durationFrames: number;
    shotType: string;
    description: string;
  }) {
    if (!canEditScript || !addShotRequest) return;
    recordHistory({ immediate: true });
    const reference = addShotRequest.afterShotId
      ? shots.find((s) => s.id === addShotRequest.afterShotId) ?? null
      : null;
    const endFrame = data.startFrame + data.durationFrames;
    const newShot: ShotData = {
      id: `new-${crypto.randomUUID()}`,
      shotNumber: nextShotNumberAfter(reference?.shotNumber, shots),
      title: "",
      shotType: data.shotType,
      status: "animatic",
      description: data.description,
      action: "",
      camera: "",
      sound: "",
      requiredElements: [],
      productionNotes: "",
      startFrame: data.startFrame,
      endFrame,
      durationFrames: data.durationFrames
    };
    setShots((current) => {
      const idx = reference ? current.findIndex((s) => s.id === reference.id) : current.length - 1;
      const insertAt = idx + 1;
      // Ripple: shift every shot from the insertion point onward by the new duration.
      const shifted = current.map((shot, i) => {
        if (i < insertAt) return shot;
        if (typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") return shot;
        return {
          ...shot,
          startFrame: shot.startFrame + data.durationFrames,
          endFrame: shot.endFrame + data.durationFrames
        };
      });
      return [...shifted.slice(0, insertAt), newShot, ...shifted.slice(insertAt)];
    });
    setActiveShotId(newShot.id);
    setAddShotRequest(null);
    requestAutosave();
  }

  function splitShot(shotId: string, atFrame: number) {
    if (!canEditScript) return;
    const idx = shots.findIndex((s) => s.id === shotId);
    if (idx < 0) return;
    const original = shots[idx];
    if (
      typeof original.startFrame !== "number" ||
      typeof original.endFrame !== "number" ||
      original.endFrame <= original.startFrame
    ) {
      setError(t("scene.splitShotError"));
      return;
    }
    const minFrames = 1;
    const cut = Math.max(original.startFrame + minFrames, Math.min(original.endFrame - minFrames, Math.round(atFrame)));
    if (cut <= original.startFrame || cut >= original.endFrame) {
      setError(t("scene.splitShotError"));
      return;
    }
    recordHistory({ immediate: true });
    const newShot: ShotData = {
      ...original,
      id: `new-${crypto.randomUUID()}`,
      shotNumber: nextShotNumberAfter(original.shotNumber, shots),
      requiredElements: [...original.requiredElements],
      startFrame: cut,
      endFrame: original.endFrame,
      durationFrames: original.endFrame - cut
    };
    setShots((current) => {
      const at = current.findIndex((s) => s.id === shotId);
      if (at < 0) return current;
      const updatedLeft: ShotData = {
        ...current[at],
        endFrame: cut,
        durationFrames: cut - (current[at].startFrame ?? 0)
      };
      return [...current.slice(0, at), updatedLeft, newShot, ...current.slice(at + 1)];
    });
    requestAutosave();
  }

  function addShotFromSelection(startFrame: number, endFrame: number) {
    if (!canEditScript) return;
    if (endFrame <= startFrame) {
      setError(t("scene.markRangeInvalid"));
      return;
    }
    recordHistory({ immediate: true });
    const currentShots = stateRef.current.shots;
    const reference = currentShots[currentShots.length - 1] ?? null;
    const newShot: ShotData = {
      id: `new-${crypto.randomUUID()}`,
      shotNumber: nextShotNumberAfter(reference?.shotNumber, currentShots),
      title: "",
      shotType: "",
      status: "animatic",
      description: "",
      action: "",
      camera: "",
      sound: "",
      requiredElements: [],
      productionNotes: "",
      startFrame: Math.round(startFrame),
      endFrame: Math.round(endFrame),
      durationFrames: Math.round(endFrame - startFrame)
    };
    setShots((current) => [...current, newShot]);
    setActiveShotId(newShot.id);
    requestAutosave();
  }

  function removeShot(shotId: string) {
    if (!canEditScript) return;
    if (!window.confirm(t("scene.removeShotConfirm"))) return;
    recordHistory({ immediate: true });
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
      rightLabel: `${right.shotNumber}${right.shotType ? ` · ${right.shotType}` : ""}`,
      leftStartFrame: left.startFrame,
      leftEndFrame: left.endFrame,
      leftDurationFrames: left.durationFrames,
      rightStartFrame: right.startFrame,
      rightEndFrame: right.endFrame,
      rightDurationFrames: right.durationFrames
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
      setLastSavedAt(Date.now());
      setAutosaveStatus("saved");
      clearLocalDraft(stateRef.current.scene.id);
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
    if (!canEditScript || !tagInputs[category].trim() || !activeShotId) return;
    setError("");
    setIsSavingTag(category);
    try {
      const response = await fetch(`/api/scenes/${scene.id}/asset-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name: tagInputs[category], shotId: activeShotId })
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
          fileSizeMb,
          shotId: activeShotId || undefined
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

  // Shared props for the timeline and the scene/script/elements full-width views.
  const timelineProps: TimelineViewProps = {
    activeShot,
    activeVideo,
    availableVideos,
    videos,
    projectMembers,
    shotStageStates,
    assetTags,
    attachments,
    attachmentDate,
    attachmentDescription,
    attachmentFile,
    attachmentTitle,
    availableResourceMembers,
    canEditScript,
    canManageResources,
    canManageVideos,
    fileInputRef,
    humanResources,
    isDeletingVideo,
    isSavingResource,
    isSavingTag,
    isUploadingAttachment,
    onAddAssetTag: addAssetTag,
    onAddHumanResource: addHumanResource,
    onAddShotAfter: addShotAfter,
    onDeleteVideo: deleteActiveVideo,
    onOpenMerge: openMergeRequest,
    onOpenScriptOverlay: () => setIsScriptOverlayOpen(true),
    onRemoveAssetTag: removeAssetTag,
    onRemoveHumanResource: removeHumanResource,
    onRemoveShot: removeShot,
    onAddShotFromSelection: addShotFromSelection,
    onRedo: redo,
    onSelectShot: setActiveShotId,
    onSelectVideo: setSelectedVideoId,
    onSetTimelineTool: setTimelineTool,
    onSplitShot: splitShot,
    onUndo: undo,
    onTagInputChange: updateTagInput,
    onUpdateResourceStages: updateResourceStages,
    onUpdateScene: updateScene,
    onUpdateShot: updateShot,
    onUploadAttachment: uploadAttachment,
    optionLabel,
    scene,
    selectedResourceStages,
    selectedResourceUserIds,
    setAttachmentDate,
    setAttachmentDescription,
    setAttachmentFile,
    setAttachmentTitle,
    setSelectedResourceStages,
    setSelectedResourceUserIds,
    shots,
    tagInputs,
    tagSuggestions,
    canRedo,
    canUndo,
    t,
    timelineTool,
    toggleSceneSoundOption
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-fg">
      <SceneHeader
        autosaveStatus={autosaveStatus}
        canDeleteScene={canEditScript}
        lastSavedAt={lastSavedAt}
        activeVideo={activeVideo}
        canManageVideos={canManageVideos}
        isDeletingVideo={isDeletingVideo}
        nextScene={nextScene}
        onDeleteScene={() => setIsDeleteSceneOpen(true)}
        onDeleteVideo={deleteActiveVideo}
        previousScene={previousScene}
        scene={scene}
        siblingScenes={siblingScenes}
        t={t}
      />

      <TopTabs t={t} value={topView} onChange={setTopView} />

      <div className="flex min-h-0 flex-1 flex-col">
        {topView === "timeline" ? (
          <TimelineView {...timelineProps} />
        ) : topView === "table" ? (
          <TableView
            canEditScript={canEditScript}
            onAddShotAfter={addShotAfter}
            onRemoveShot={removeShot}
            onUpdateShot={updateShot}
            scene={scene}
            shots={shots}
            t={t}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl">
              {topView === "scene" ? <SceneTab {...timelineProps} /> : null}
              {topView === "script" ? <ScriptTab {...timelineProps} /> : null}
            </div>
          </div>
        )}
      </div>

      {SHOW_AUDIO_PANEL ? (
        <AudioTracksPanel
          sceneId={scene.id}
          soundOptions={scene.soundOptions}
          initialAudio={audioVersions}
          canManage={canManageVideos}
          optionLabel={optionLabel}
          t={t}
        />
      ) : null}

      {error ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-red-600/60 bg-danger-soft px-4 py-2 text-sm text-danger-fg shadow-lg">
          <div className="flex items-center gap-3">
            <span>{error}</span>
            <button
              className="text-danger-fg hover:text-white"
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
          fps={scene.fpsDefault}
          isSubmitting={isMerging}
          onCancel={() => setMergeRequest(null)}
          onConfirm={confirmMerge}
          request={mergeRequest}
          t={t}
        />
      ) : null}

      {addShotRequest ? (
        <AddShotModal
          fps={scene.fpsDefault}
          onCancel={() => setAddShotRequest(null)}
          onConfirm={confirmAddShot}
          request={addShotRequest}
          t={t}
        />
      ) : null}

      {isDeleteSceneOpen ? (
        <DeleteSceneModal
          onCancel={() => setIsDeleteSceneOpen(false)}
          projectId={scene.projectId}
          sceneId={scene.id}
          sceneNumber={scene.sceneNumber}
          sceneTitle={scene.title}
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
  canDeleteScene,
  canManageVideos,
  isDeletingVideo,
  lastSavedAt,
  nextScene,
  onDeleteScene,
  onDeleteVideo,
  previousScene,
  scene,
  siblingScenes,
  t
}: {
  autosaveStatus: AutosaveStatus;
  activeVideo: VideoData | null;
  canDeleteScene: boolean;
  canManageVideos: boolean;
  isDeletingVideo: boolean;
  lastSavedAt: number | null;
  nextScene: SceneSiblingData | null;
  onDeleteScene: () => void;
  onDeleteVideo: () => void;
  previousScene: SceneSiblingData | null;
  scene: SceneData;
  siblingScenes: SceneSiblingData[];
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const router = useRouter();
  return (
    <header className="shrink-0 border-b border-line bg-background/80 px-5 py-3 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            className="text-xs font-medium text-muted hover:text-fg"
            href={`/projects/${scene.projectId}`}
          >
            ← {t("scene.backToProject")}
          </Link>
          <div className="hidden h-6 w-px bg-elevated sm:block" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">
              {t("scene.scene")} {scene.sceneNumber}
            </p>
            <h1 className="text-base font-semibold text-fg-strong sm:text-lg">{scene.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutosaveBadge lastSavedAt={lastSavedAt} status={autosaveStatus} t={t} />
          {previousScene ? (
            <Link
              className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-muted-strong hover:bg-elevated"
              href={`/scenes/${previousScene.id}`}
              title={previousScene.title}
            >
              <span>←</span>
              <span>{t("scene.previousScene", { sceneNumber: previousScene.sceneNumber })}</span>
            </Link>
          ) : null}
          {siblingScenes.length > 1 ? (
            <select
              aria-label={t("scene.sceneSelector")}
              className="h-8 max-w-[220px] rounded-md border border-line bg-surface px-2 text-xs font-medium text-fg hover:bg-elevated focus:outline-none"
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId && nextId !== scene.id) router.push(`/scenes/${nextId}`);
              }}
              value={scene.id}
            >
              {siblingScenes.map((sibling) => (
                <option key={sibling.id} value={sibling.id}>
                  {t("scene.scene")} {sibling.sceneNumber} · {sibling.title}
                </option>
              ))}
            </select>
          ) : null}
          {nextScene ? (
            <Link
              className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-muted-strong hover:bg-elevated"
              href={`/scenes/${nextScene.id}`}
              title={nextScene.title}
            >
              <span>{t("scene.nextScene", { sceneNumber: nextScene.sceneNumber })}</span>
              <span>→</span>
            </Link>
          ) : null}
          <a
            className="inline-flex h-8 items-center justify-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-fg hover:bg-elevated"
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
              className="inline-flex h-8 items-center justify-center rounded-md border border-danger px-3 text-xs font-medium text-danger-fg hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeletingVideo}
              onClick={onDeleteVideo}
              type="button"
            >
              {isDeletingVideo ? t("scene.deletingVideo") : t("scene.deleteVideo")}
            </button>
          ) : null}
          {canDeleteScene ? (
            <button
              className="inline-flex h-8 items-center justify-center rounded-md border border-danger px-3 text-xs font-medium text-danger-fg hover:bg-danger-soft"
              onClick={onDeleteScene}
              title={t("scene.deleteScene")}
              type="button"
            >
              {t("scene.deleteScene")}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function AutosaveBadge({
  lastSavedAt,
  status,
  t
}: {
  lastSavedAt: number | null;
  status: AutosaveStatus;
  t: (path: string) => string;
}) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  const relative = lastSavedAt ? formatLastSaved(lastSavedAt, now, locale) : "";

  const map: Record<AutosaveStatus, { label: string; cls: string } | null> = {
    idle: relative ? { label: `${t("scene.autosaveSaved")} · ${relative}`, cls: "text-muted" } : null,
    saving: { label: t("scene.autosaveSaving"), cls: "text-warning-fg" },
    saved: relative
      ? { label: `${t("scene.autosaveSaved")} · ${relative}`, cls: "text-success-fg" }
      : { label: t("scene.autosaveSaved"), cls: "text-success-fg" },
    error: relative
      ? { label: `${t("scene.autosaveError")} · ${relative}`, cls: "text-danger-fg" }
      : { label: t("scene.autosaveError"), cls: "text-danger-fg" }
  };
  const data = map[status];
  if (!data) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${data.cls}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {data.label}
    </span>
  );
}

function formatLastSaved(ts: number, now: number, locale: string): string {
  const diffMs = Math.max(0, now - ts);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-sec, "second");
    } catch {
      return `hace ${sec}s`;
    }
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-min, "minute");
    } catch {
      return `hace ${min}m`;
    }
  }
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-hours, "hour");
    } catch {
      return `hace ${hours}h`;
    }
  }
  try {
    return new Date(ts).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
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
    { key: "table", label: t("scene.viewTable") },
    { key: "scene", label: t("scene.tabScene") },
    { key: "script", label: t("scene.tabScript") }
  ];
  return (
    <div className="shrink-0 border-b border-line bg-background px-5 sm:px-7">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              className={[
                "relative px-3 py-2.5 text-sm font-medium transition",
                active ? "text-fg-strong" : "text-muted hover:text-fg"
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
  videos: VideoData[];
  projectMembers: ProjectMemberData[];
  shotStageStates: ShotStageStateData[];
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
  onAddShotFromSelection: (startFrame: number, endFrame: number) => void;
  onRedo: () => void;
  onSelectShot: (id: string) => void;
  onSelectVideo: (id: string) => void;
  onSetTimelineTool: (tool: TimelineTool) => void;
  onSplitShot: (id: string, atFrame: number) => void;
  onUndo: () => void;
  onTagInputChange: (category: AssetTagCategory, value: string) => void;
  canRedo: boolean;
  canUndo: boolean;
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
  shots: ShotData[];
  tagInputs: Record<string, string>;
  tagSuggestions: Record<string, AssetTagSuggestion[]>;
  t: (path: string, replacements?: Record<string, string | number>) => string;
  timelineTool: TimelineTool;
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
    canRedo,
    canUndo,
    onAddShotFromSelection,
    onRedo,
    onSelectShot,
    onSelectVideo,
    onSetTimelineTool,
    onSplitShot,
    onUndo,
    onUpdateShot,
    optionLabel,
    scene,
    shots,
    t,
    timelineTool
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
    const endSeconds =
      typeof activeShot.endFrame === "number" ? activeShot.endFrame / fps : null;
    const seek = () => {
      // If the playhead is already within the active shot's range, don't seek.
      // This means the active shot change came from auto-follow during playback,
      // or the user clicked the already-active shot — in either case, jumping to
      // startFrame would yank the user backwards.
      if (endSeconds !== null && video.currentTime >= targetSeconds && video.currentTime < endSeconds) {
        return;
      }
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
  }, [activeShot?.id, activeShot?.startFrame, activeShot?.endFrame, fps, activeVideo?.id]);

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

  const playBackwardRafRef = useRef<number | null>(null);
  const playBackwardLastRef = useRef<number>(0);

  const stopBackwardPlay = useCallback(() => {
    if (playBackwardRafRef.current !== null) {
      cancelAnimationFrame(playBackwardRafRef.current);
      playBackwardRafRef.current = null;
    }
  }, []);

  const playForward = useCallback(() => {
    stopBackwardPlay();
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      /* autoplay may be blocked */
    });
  }, [stopBackwardPlay]);

  const playBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    if (playBackwardRafRef.current !== null) return;
    playBackwardLastRef.current = performance.now();
    const tick = () => {
      const v = videoRef.current;
      if (!v) {
        playBackwardRafRef.current = null;
        return;
      }
      const now = performance.now();
      const delta = (now - playBackwardLastRef.current) / 1000;
      playBackwardLastRef.current = now;
      const next = v.currentTime - delta;
      if (next <= 0) {
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
        playBackwardRafRef.current = null;
        return;
      }
      try {
        v.currentTime = next;
      } catch {
        /* ignore */
      }
      playBackwardRafRef.current = requestAnimationFrame(tick);
    };
    playBackwardRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAllPlay = useCallback(() => {
    stopBackwardPlay();
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
  }, [stopBackwardPlay]);

  useEffect(() => () => stopBackwardPlay(), [stopBackwardPlay]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playBackwardRafRef.current !== null) {
      stopBackwardPlay();
      return;
    }
    if (video.paused) {
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    } else {
      video.pause();
    }
  }, [stopBackwardPlay]);

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
    },
    [onSelectShot]
  );

  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const [resizingShotId, setResizingShotId] = useState<string | null>(null);
  const handleResizeStart = useCallback((shotId: string) => setResizingShotId(shotId), []);
  const handleResizeEnd = useCallback(() => setResizingShotId(null), []);

  const [markInFrame, setMarkInFrame] = useState<number | null>(null);
  const [markOutFrame, setMarkOutFrame] = useState<number | null>(null);

  const markInAtPlayhead = useCallback(() => {
    setMarkInFrame(Math.round(playbackSeconds * fps));
  }, [playbackSeconds, fps]);

  const markOutAtPlayhead = useCallback(() => {
    setMarkOutFrame(Math.round(playbackSeconds * fps));
  }, [playbackSeconds, fps]);

  const clearMarks = useCallback(() => {
    setMarkInFrame(null);
    setMarkOutFrame(null);
  }, []);

  const insertSelectionAsShot = useCallback(() => {
    if (markInFrame == null || markOutFrame == null) return;
    if (markOutFrame <= markInFrame) return;
    onAddShotFromSelection(markInFrame, markOutFrame);
    setMarkInFrame(null);
    setMarkOutFrame(null);
  }, [markInFrame, markOutFrame, onAddShotFromSelection]);

  const canInsertSelection = markInFrame != null && markOutFrame != null && markOutFrame > markInFrame;

  const handleResizeRightEdge = useCallback(
    (shotId: string, newEndFrame: number) => {
      const currentShots = shotsRef.current;
      const idx = currentShots.findIndex((shot) => shot.id === shotId);
      if (idx < 0) return;
      const shot = currentShots[idx];
      const next = currentShots[idx + 1];
      if (typeof shot.startFrame !== "number") return;
      const MIN_FRAMES = 1;
      let clampedEnd = Math.max(shot.startFrame + MIN_FRAMES, newEndFrame);

      if (next && typeof next.endFrame === "number") {
        const maxEnd = next.endFrame - MIN_FRAMES;
        clampedEnd = Math.min(clampedEnd, maxEnd);
      }

      onUpdateShot(shotId, {
        endFrame: clampedEnd,
        durationFrames: clampedEnd - shot.startFrame
      });

      if (next && typeof next.endFrame === "number") {
        onUpdateShot(next.id, {
          startFrame: clampedEnd,
          durationFrames: next.endFrame - clampedEnd
        });
      }
    },
    [onUpdateShot]
  );

  const TIMELINE_PADDING_PX = 12;
  const timelineGeometry = useMemo(() => {
    const gap = canEditScript ? 16 : 8;
    const items: { startPx: number; widthPx: number }[] = [];
    let cursor = 0;
    const resizingIdx = resizingShotId ? shots.findIndex((s) => s.id === resizingShotId) : -1;
    for (let i = 0; i < shots.length; i += 1) {
      const shot = shots[i];
      // Segment width tracks the shot's actual video range (endFrame - startFrame)
      // so the playhead speed matches the video; fall back to durationFrames, then
      // a 2s default. Using the range also avoids stale/corrupt durationFrames.
      const spanFrames =
        typeof shot.startFrame === "number" &&
        typeof shot.endFrame === "number" &&
        shot.endFrame > shot.startFrame
          ? shot.endFrame - shot.startFrame
          : typeof shot.durationFrames === "number" && shot.durationFrames > 0
            ? shot.durationFrames
            : 2 * fps;
      const durationSecs = spanFrames / fps;
      const isInvolvedInResize =
        resizingShotId != null && (i === resizingIdx || i === resizingIdx + 1);
      const w = isInvolvedInResize
        ? Math.max(16, Math.round(durationSecs * PIXELS_PER_SECOND))
        : Math.max(MIN_THUMB_WIDTH_PX, Math.round(durationSecs * PIXELS_PER_SECOND));
      const itemGap = i < shots.length - 1 ? gap : 0;
      items.push({ startPx: cursor, widthPx: w });
      cursor += w + itemGap;
    }
    return { items, totalWidth: cursor };
  }, [shots, canEditScript, fps, resizingShotId]);

  // Playhead is driven by the video's current time (playbackSeconds), independent
  // of which shot is "active", so it tracks playback continuously across segments.
  const playheadPx = useMemo(() => {
    if (shots.length === 0) return null;
    const playbackFrames = playbackSeconds * fps;

    // Position within whichever shot's video range contains the playhead.
    for (let i = 0; i < shots.length; i += 1) {
      const shot = shots[i];
      const item = timelineGeometry.items[i];
      if (!item || typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") continue;
      const span = shot.endFrame - shot.startFrame;
      if (span <= 0) continue;
      if (playbackFrames >= shot.startFrame && playbackFrames < shot.endFrame) {
        const progress = (playbackFrames - shot.startFrame) / span;
        return TIMELINE_PADDING_PX + item.startPx + progress * item.widthPx;
      }
    }

    // Outside any shot range (gap / before / after): snap to the nearest edge.
    let lastBeforeIdx = -1;
    for (let i = 0; i < shots.length; i += 1) {
      const s = shots[i];
      if (typeof s.startFrame === "number" && s.startFrame <= playbackFrames) lastBeforeIdx = i;
    }
    if (lastBeforeIdx < 0) {
      const first = timelineGeometry.items[0];
      return first ? TIMELINE_PADDING_PX + first.startPx : null;
    }
    const item = timelineGeometry.items[lastBeforeIdx];
    return item ? TIMELINE_PADDING_PX + item.startPx + item.widthPx : null;
  }, [shots, timelineGeometry, playbackSeconds, fps]);

  const playheadScrubbingRef = useRef(false);
  const seekFromTimelinePx = useCallback(
    (xPx: number) => {
      const adjusted = xPx - TIMELINE_PADDING_PX;
      for (let i = 0; i < timelineGeometry.items.length; i += 1) {
        const item = timelineGeometry.items[i];
        if (adjusted >= item.startPx && adjusted <= item.startPx + item.widthPx) {
          const shot = shots[i];
          if (typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") return;
          const ratio = Math.max(0, Math.min(1, (adjusted - item.startPx) / Math.max(1, item.widthPx)));
          const frame = shot.startFrame + ratio * (shot.endFrame - shot.startFrame);
          if (shot.id !== activeShot?.id) onSelectShot(shot.id);
          seekTo(frame / fps);
          return;
        }
      }
    },
    [timelineGeometry, shots, fps, seekTo, onSelectShot, activeShot?.id]
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
        case "j":
        case "J":
          event.preventDefault();
          playBackward();
          break;
        case "k":
        case "K":
          event.preventDefault();
          stopAllPlay();
          break;
        case "l":
        case "L":
          event.preventDefault();
          playForward();
          break;
        case "i":
        case "I":
          event.preventDefault();
          markInAtPlayhead();
          break;
        case "o":
        case "O":
          event.preventDefault();
          markOutAtPlayhead();
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
  }, [
    togglePlayback,
    stepFrame,
    goPrevShot,
    goNextShot,
    toggleMute,
    toggleFullscreen,
    playBackward,
    playForward,
    stopAllPlay,
    markInAtPlayhead,
    markOutAtPlayhead
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col bg-background" ref={playerContainerRef}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 text-xs text-muted sm:px-6">
            <div className="min-w-0">
              {activeVideo ? (
                <span>
                  <span className="font-semibold text-fg">
                    {optionLabel("productionStages", activeVideo.stage)} v{activeVideo.versionNumber}
                  </span>
                  <span className="text-muted"> · {activeVideo.resolution}</span>
                </span>
              ) : (
                <span className="text-muted">{t("scene.noVideoSelection")}</span>
              )}
            </div>
            {availableVideos.length > 1 ? (
              <select
                className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg"
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
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 sm:p-5">
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
              canInsertSelection={canInsertSelection}
              duration={duration}
              fps={fps}
              isFullscreen={isFullscreen}
              isMuted={isMuted}
              isPlaying={isPlaying}
              markInFrame={markInFrame}
              markOutFrame={markOutFrame}
              onClearMarks={clearMarks}
              onInsertSelection={insertSelectionAsShot}
              onMarkIn={markInAtPlayhead}
              onMarkOut={markOutAtPlayhead}
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

        <aside className="flex w-full shrink-0 flex-col border-line bg-surface lg:w-[380px] lg:border-l xl:w-[420px]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ShotTab {...props} />
            <ElementsTab {...props} />
            <FilesTab {...props} />
            {props.canEditScript && props.activeShot ? (
              <div className="border-t border-line p-4 sm:p-5">
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-danger px-3 py-2 text-[12px] font-medium text-danger-fg hover:bg-danger-soft"
                  onClick={() => props.onRemoveShot(props.activeShot!.id)}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                  {props.t("scene.deleteShot")}
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="shrink-0 border-t border-line bg-background">
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3 sm:px-7">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.shotsTimeline")}
            </p>
            {canEditScript ? (
              <div className="inline-flex overflow-hidden rounded-md border border-line">
                <button
                  aria-label={t("scene.undo")}
                  className="inline-flex h-7 w-8 items-center justify-center bg-surface text-muted hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-muted"
                  disabled={!canUndo}
                  onClick={onUndo}
                  title={t("scene.undo")}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M9 14l-4-4 4-4" />
                    <path d="M5 10h11a4 4 0 0 1 0 8h-2" />
                  </svg>
                </button>
                <button
                  aria-label={t("scene.redo")}
                  className="inline-flex h-7 w-8 items-center justify-center border-l border-line bg-surface text-muted hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-muted"
                  disabled={!canRedo}
                  onClick={onRedo}
                  title={t("scene.redo")}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M15 14l4-4-4-4" />
                    <path d="M19 10H8a4 4 0 0 0 0 8h2" />
                  </svg>
                </button>
              </div>
            ) : null}
            {canEditScript ? (
              <div className="inline-flex overflow-hidden rounded-md border border-line">
                <button
                  aria-label={t("scene.toolSelect")}
                  className={[
                    "inline-flex h-7 w-8 items-center justify-center text-xs",
                    timelineTool === "select"
                      ? "bg-red-600 text-white"
                      : "bg-surface text-muted hover:bg-elevated hover:text-fg"
                  ].join(" ")}
                  onClick={() => onSetTimelineTool("select")}
                  title={t("scene.toolSelect")}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M5 3l14 8-6 1-2 6z" />
                  </svg>
                </button>
                <button
                  aria-label={t("scene.toolBlade")}
                  className={[
                    "inline-flex h-7 w-8 items-center justify-center border-l border-line text-xs",
                    timelineTool === "blade"
                      ? "bg-red-600 text-white"
                      : "bg-surface text-muted hover:bg-elevated hover:text-fg"
                  ].join(" ")}
                  onClick={() => onSetTimelineTool("blade")}
                  title={t("scene.toolBlade")}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <line x1="20" y1="4" x2="8.12" y2="15.88" />
                    <line x1="14.47" y1="14.48" x2="20" y2="20" />
                    <line x1="8.12" y1="8.12" x2="12" y2="12" />
                  </svg>
                </button>
              </div>
            ) : null}
            {timelineTool === "blade" ? (
              <span className="text-[11px] text-warning-fg">{t("scene.toolBladeHint")}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span>{shots.length} {t("scene.shotsCount")}</span>
            {canEditScript ? (
              <button
                className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-muted-strong hover:bg-elevated"
                onClick={() => onAddShotAfter(activeShot ?? shots[shots.length - 1] ?? null)}
                type="button"
              >
                + {t("scene.addShot")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-hidden">
          <ul
            className="relative flex items-stretch gap-0 px-3 pb-4 pt-2"
            style={{ minWidth: `${timelineGeometry.totalWidth + TIMELINE_PADDING_PX * 2}px` }}
          >
            {shots.map((shot, idx) => {
              const isActive = shot.id === activeShot?.id;
              const nextShot = shots[idx + 1];
              const hasRange =
                typeof shot.startFrame === "number" &&
                typeof shot.endFrame === "number" &&
                shot.endFrame > shot.startFrame;
              const widthPx = timelineGeometry.items[idx]?.widthPx ?? MIN_THUMB_WIDTH_PX;
              // Resizable when there's a valid neighbouring cut to move, OR when
              // it's the last shot (no next) — in that case the right edge just
              // extends the shot's own duration (handleResizeRightEdge clamps the
              // minimum only and leaves the upper bound open).
              const canResize =
                canEditScript &&
                hasRange &&
                (nextShot == null ||
                  (typeof nextShot.startFrame === "number" && typeof nextShot.endFrame === "number"));
              return (
                <li className="flex shrink-0 items-stretch" key={shot.id} ref={isActive ? activeThumbRef : null}>
                  <ShotThumbnail
                    canResize={canResize}
                    fps={fps}
                    hasRange={hasRange}
                    isActive={isActive}
                    onResizeEnd={handleResizeEnd}
                    onResizeRight={handleResizeRightEdge}
                    onResizeStart={handleResizeStart}
                    onSeek={seekTo}
                    onSelect={handleSelectShotFromThumb}
                    onSplit={onSplitShot}
                    optionLabel={optionLabel}
                    pixelsPerSecond={PIXELS_PER_SECOND}
                    scrubbingRef={isScrubbingRef}
                    scene={scene}
                    shot={shot}
                    tool={timelineTool}
                    widthPx={widthPx}
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
              <li className="flex h-24 w-full items-center justify-center px-5 text-sm text-muted">
                {t("scene.emptyShots")}
              </li>
            ) : null}
            {playheadPx !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-2 z-40 w-px bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                style={{ left: `${playheadPx}px`, bottom: "16px" }}
              >
                <div
                  className="pointer-events-auto absolute -left-1.5 -top-1 h-3 w-3 cursor-ew-resize rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]"
                  onPointerCancel={(event) => {
                    if (!playheadScrubbingRef.current) return;
                    try {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch {
                      /* ignore */
                    }
                    playheadScrubbingRef.current = false;
                    isScrubbingRef.current = false;
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    playheadScrubbingRef.current = true;
                    isScrubbingRef.current = true;
                  }}
                  onPointerMove={(event) => {
                    if (!playheadScrubbingRef.current) return;
                    const ul = (event.currentTarget.parentElement?.parentElement) as HTMLElement | null;
                    if (!ul) return;
                    const rect = ul.getBoundingClientRect();
                    const xPx = event.clientX - rect.left;
                    seekFromTimelinePx(xPx);
                  }}
                  onPointerUp={(event) => {
                    if (!playheadScrubbingRef.current) return;
                    try {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch {
                      /* ignore */
                    }
                    playheadScrubbingRef.current = false;
                    isScrubbingRef.current = false;
                  }}
                />
              </div>
            ) : null}
          </ul>
        </div>
      </section>
    </div>
  );
}

function VideoTransport({
  activeShot,
  canInsertSelection,
  duration,
  fps,
  isFullscreen,
  isMuted,
  isPlaying,
  markInFrame,
  markOutFrame,
  onClearMarks,
  onInsertSelection,
  onMarkIn,
  onMarkOut,
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
  canInsertSelection: boolean;
  duration: number;
  fps: number;
  isFullscreen: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  markInFrame: number | null;
  markOutFrame: number | null;
  onClearMarks: () => void;
  onInsertSelection: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
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
    <div className="shrink-0 border-t border-line bg-background px-3 py-2 sm:px-5">
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

        <div className="flex shrink-0 items-center gap-1">
          <TransportButton label={t("scene.markIn")} onClick={onMarkIn}>
            <span className="text-[11px] font-semibold tracking-wider">I</span>
          </TransportButton>
          <TransportButton label={t("scene.markOut")} onClick={onMarkOut}>
            <span className="text-[11px] font-semibold tracking-wider">O</span>
          </TransportButton>
          <TransportButton
            disabled={!canInsertSelection}
            label={t("scene.insertSelection")}
            onClick={onInsertSelection}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v12" />
              <path d="M7 11l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
          </TransportButton>
          {markInFrame != null || markOutFrame != null ? (
            <TransportButton label={t("scene.clearMarks")} onClick={onClearMarks}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </TransportButton>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] tabular-nums">
          <span className="font-semibold text-fg">
            {framesToTimecode(Math.round(playbackSeconds * fps), fps)}
          </span>
          <span className="text-muted">/</span>
          <span className="text-muted">{framesToTimecode(Math.round(safeDuration * fps), fps)}</span>
        </div>

        <div
          className="relative h-2 flex-1 cursor-pointer touch-none select-none rounded-full bg-elevated"
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
          {safeDuration > 0 && markInFrame != null && markOutFrame != null && markOutFrame > markInFrame ? (
            <div
              aria-hidden
              className="absolute top-0 h-full bg-amber-400/25"
              style={{
                left: `${Math.max(0, Math.min(1, markInFrame / fps / safeDuration)) * 100}%`,
                width: `${
                  Math.max(0, Math.min(1, (markOutFrame - markInFrame) / fps / safeDuration)) * 100
                }%`
              }}
            />
          ) : null}
          {safeDuration > 0 && markInFrame != null ? (
            <div
              aria-hidden
              className="absolute inset-y-0 w-px bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
              style={{ left: `${Math.max(0, Math.min(1, markInFrame / fps / safeDuration)) * 100}%` }}
            />
          ) : null}
          {safeDuration > 0 && markOutFrame != null ? (
            <div
              aria-hidden
              className="absolute inset-y-0 w-px bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
              style={{ left: `${Math.max(0, Math.min(1, markOutFrame / fps / safeDuration)) * 100}%` }}
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
                    className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong"
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
          : "border border-line bg-surface text-fg hover:border-line-strong hover:bg-elevated"
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
  canResize: boolean;
  fps: number;
  hasRange: boolean;
  isActive: boolean;
  onResizeEnd: () => void;
  onResizeRight: (shotId: string, newEndFrame: number) => void;
  onResizeStart: (shotId: string) => void;
  onSeek: (seconds: number) => void;
  onSelect: (shotId: string) => void;
  onSplit: (shotId: string, atFrame: number) => void;
  optionLabel: (group: string, value: string) => string;
  pixelsPerSecond: number;
  scrubbingRef: React.MutableRefObject<boolean>;
  scene: SceneData;
  shot: ShotData;
  tool: TimelineTool;
  widthPx: number;
};

const ShotThumbnail = memo(function ShotThumbnail({
  canResize,
  fps,
  hasRange,
  isActive,
  onResizeEnd,
  onResizeRight,
  onResizeStart,
  onSeek,
  onSelect,
  onSplit,
  pixelsPerSecond,
  scrubbingRef,
  scene,
  shot,
  tool,
  widthPx
}: ShotThumbnailProps) {
  const handleSelect = useCallback(() => onSelect(shot.id), [onSelect, shot.id]);
  const localScrubbingRef = useRef(false);
  const resizeStateRef = useRef<{ startX: number; startEndFrame: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [bladePreview, setBladePreview] = useState<{ xPct: number; frame: number } | null>(null);

  const seekFromClientX = (clientX: number, target: HTMLElement) => {
    if (typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const seconds = (shot.startFrame + ratio * (shot.endFrame - shot.startFrame)) / fps;
    onSeek(seconds);
  };

  const handleBladeClick = (clientX: number, target: HTMLElement) => {
    if (typeof shot.startFrame !== "number" || typeof shot.endFrame !== "number") return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const frame = shot.startFrame + ratio * (shot.endFrame - shot.startFrame);
    onSplit(shot.id, frame);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "blade" && hasRange) {
      event.preventDefault();
      event.stopPropagation();
      handleBladeClick(event.clientX, event.currentTarget);
      return;
    }
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
    if (tool === "blade" && hasRange && typeof shot.startFrame === "number" && typeof shot.endFrame === "number") {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      const frame = shot.startFrame + ratio * (shot.endFrame - shot.startFrame);
      setBladePreview({ xPct: ratio * 100, frame });
      return;
    }
    if (!localScrubbingRef.current) return;
    seekFromClientX(event.clientX, event.currentTarget);
  };

  const handlePointerLeave = () => {
    if (bladePreview !== null) setBladePreview(null);
  };

  useEffect(() => {
    if (tool !== "blade" && bladePreview !== null) setBladePreview(null);
  }, [tool, bladePreview]);

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

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize || typeof shot.endFrame !== "number") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = { startX: event.clientX, startEndFrame: shot.endFrame };
    setIsResizing(true);
    onResizeStart(shot.id);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const deltaPx = event.clientX - state.startX;
    const deltaFrames = Math.round((deltaPx / pixelsPerSecond) * fps);
    const nextEnd = state.startEndFrame + deltaFrames;
    onResizeRight(shot.id, nextEnd);
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    resizeStateRef.current = null;
    setIsResizing(false);
    onResizeEnd();
  };

  return (
    <div
      className={[
        "group relative flex shrink-0 flex-col overflow-hidden rounded-md border transition",
        isActive
          ? "border-red-500/80 ring-2 ring-red-500/40"
          : "border-line hover:border-line-strong",
        isResizing ? "ring-2 ring-amber-400/50" : ""
      ].join(" ")}
      style={{ width: `${widthPx}px` }}
    >
      <div
        className={[
          "relative flex h-20 w-full select-none items-end overflow-hidden bg-surface p-2 touch-none",
          tool === "blade" && hasRange
            ? "cursor-crosshair"
            : isActive && hasRange
              ? "cursor-ew-resize"
              : "cursor-pointer"
        ].join(" ")}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {framesToTimecode(shot.startFrame, scene.fpsDefault)}
        </span>
        <div className="pointer-events-none relative z-10 min-w-0">
          {shot.title ? (
            <p className="truncate text-[11px] font-semibold text-fg-strong">{shot.title}</p>
          ) : null}
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-strong">
            {shot.shotNumber}
          </p>
        </div>
        {tool === "blade" && bladePreview ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
              style={{ left: `${bladePreview.xPct}%` }}
            />
            <span
              className="pointer-events-none absolute z-30 -translate-x-1/2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-fg-strong shadow"
              style={{ left: `${bladePreview.xPct}%`, top: "2px" }}
            >
              {framesToTimecode(Math.round(bladePreview.frame), scene.fpsDefault)}
            </span>
          </>
        ) : null}
      </div>
      <button
        className="flex min-h-12 flex-col gap-0.5 bg-surface px-2 py-1.5 text-left hover:bg-elevated"
        onClick={handleSelect}
        type="button"
      >
        <p className="truncate text-[11px] font-medium text-fg">{shot.shotType || "—"}</p>
        <p className="truncate text-[10px] text-muted">
          {formatDurationSeconds(shot.durationFrames, scene.fpsDefault)}
        </p>
      </button>
      {canResize ? (
        <div
          aria-label="resize"
          className={[
            "absolute right-0 top-0 z-30 flex h-full w-2.5 cursor-col-resize touch-none items-center justify-center",
            isResizing ? "bg-amber-400/40" : "bg-transparent hover:bg-amber-400/20"
          ].join(" ")}
          onPointerCancel={handleResizePointerUp}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          role="separator"
        >
          <span
            aria-hidden
            className={[
              "h-8 w-0.5 rounded-full transition",
              isResizing ? "bg-amber-300" : "bg-line-strong group-hover:bg-amber-400/70"
            ].join(" ")}
          />
        </div>
      ) : null}
    </div>
  );
}, areShotThumbnailPropsEqual);

function areShotThumbnailPropsEqual(prev: ShotThumbnailProps, next: ShotThumbnailProps) {
  if (prev.isActive !== next.isActive) return false;
  if (prev.hasRange !== next.hasRange) return false;
  if (prev.canResize !== next.canResize) return false;
  if (prev.widthPx !== next.widthPx) return false;
  if (prev.pixelsPerSecond !== next.pixelsPerSecond) return false;
  if (prev.fps !== next.fps) return false;
  if (prev.tool !== next.tool) return false;
  if (prev.onSeek !== next.onSeek) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onSplit !== next.onSplit) return false;
  if (prev.onResizeRight !== next.onResizeRight) return false;
  if (prev.onResizeStart !== next.onResizeStart) return false;
  if (prev.onResizeEnd !== next.onResizeEnd) return false;
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
        className="invisible flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface text-muted-strong opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 hover:border-red-500 hover:bg-red-600/20 hover:text-danger-fg"
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
    <div className="flex max-w-md flex-col items-center justify-center rounded-md border border-dashed border-line bg-background/60 px-8 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-muted">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path d="M5 5h11l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
          <path d="M10 11l5 3-5 3z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-fg">{t("scene.noPreviewTitle")}</p>
      <p className="mt-1 text-xs text-muted">{t("scene.noPreviewBody")}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</span>;
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
      className="h-9 w-full min-w-0 rounded-md border border-line bg-background px-2.5 text-sm text-fg focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
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
  onBlur,
  onChange,
  value,
  rows = 3
}: {
  disabled?: boolean;
  onBlur?: () => void;
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
      className="w-full min-w-0 resize-none overflow-hidden rounded-md border border-line bg-background px-2.5 py-2 text-sm leading-5 text-fg focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      style={{ minHeight: `${rows * 20 + 18}px` }}
      value={value}
    />
  );
}

function MultilineListField({
  disabled,
  onCommit,
  value
}: {
  disabled?: boolean;
  onCommit: (next: string[]) => void;
  value: string[];
}) {
  const [text, setText] = useState(() => value.join("\n"));
  const lastValueRef = useRef(value);
  useEffect(() => {
    // Only resync when the upstream array reference actually changes (e.g., the user
    // switched to a different shot). Avoids stomping mid-typing whitespace/newlines.
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setText(value.join("\n"));
    }
  }, [value]);
  return (
    <TextArea
      disabled={disabled}
      onBlur={() => {
        const next = splitElements(text);
        const canonical = next.join("\n");
        if (canonical !== text) setText(canonical);
        if (next.length !== value.length || next.some((item, i) => item !== value[i])) {
          lastValueRef.current = next;
          onCommit(next);
        }
      }}
      onChange={setText}
      value={text}
    />
  );
}

function SceneTab(props: TimelineViewProps) {
  const { canEditScript, optionLabel, onUpdateScene, scene, t, toggleSceneSoundOption } = props;
  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <div className="grid min-w-0 gap-2">
        <FieldLabel>{t("scene.number")}</FieldLabel>
        <TextInput disabled value={scene.sceneNumber} onChange={() => {}} />
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
              className="flex items-center gap-2 rounded-md border border-line bg-background px-2 py-1.5 text-xs text-muted-strong"
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
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-background px-2 py-1 text-[10px] font-medium text-muted-strong hover:bg-surface"
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
            <kbd className="rounded border border-line-strong bg-surface px-1 text-[9px] font-mono text-muted">G</kbd>
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
  const {
    activeShot,
    canEditScript,
    onUpdateScene,
    onUpdateShot,
    optionLabel,
    projectMembers,
    scene,
    shotStageStates,
    t,
    videos
  } = props;

  // Estado local por (plano × etapa activa). La etapa activa = scene.stage,
  // que es la que "manda": estado de revisión, responsables y videos se editan
  // siempre en el contexto de esa etapa.
  const [stageStates, setStageStates] = useState<ShotStageStateData[]>(shotStageStates);
  const [stageVideos, setStageVideos] = useState<VideoData[]>(videos);
  const [isUploading, setIsUploading] = useState(false);
  const [stageError, setStageError] = useState("");
  const stageFileRef = useRef<HTMLInputElement>(null);

  const memberName = useMemo(
    () => new Map(projectMembers.map((member) => [member.id, member.name])),
    [projectMembers]
  );

  const activeStage = scene.stage;
  const shotId = activeShot?.id ?? "";
  const currentState = stageStates.find((s) => s.shotId === shotId && s.stage === activeStage) ?? null;
  const reviewStatus = currentState?.reviewStatus ?? "draft";
  const assignees = currentState?.assignees ?? [];
  const stageClips = stageVideos
    .filter((v) => v.shotId === shotId && v.stage === activeStage && v.scope === "shot" && v.url)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  async function persistStage(patch: { reviewStatus?: string; assignees?: string[] }) {
    if (!canEditScript || !shotId) return;
    setStageError("");
    setStageStates((current) => {
      const existing = current.find((s) => s.shotId === shotId && s.stage === activeStage);
      if (existing) return current.map((s) => (s === existing ? { ...s, ...patch } : s));
      return [
        ...current,
        { id: `local-${activeStage}`, shotId, stage: activeStage, reviewStatus: "draft", assignees: [], ...patch }
      ];
    });
    try {
      const res = await fetch(`/api/scenes/${scene.id}/shot-stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, stage: activeStage, ...patch })
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
      const payload = (await res.json()) as { stageState: ShotStageStateData };
      setStageStates((current) => [
        ...current.filter((s) => !(s.shotId === shotId && s.stage === activeStage)),
        payload.stageState
      ]);
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Error al guardar");
    }
  }

  function toggleAssignee(userId: string) {
    const next = assignees.includes(userId) ? assignees.filter((id) => id !== userId) : [...assignees, userId];
    void persistStage({ assignees: next });
  }

  async function handleStageFile(file: File) {
    if (!shotId) return;
    setStageError("");
    setIsUploading(true);
    try {
      const result = await uploadShotVideo({
        projectId: scene.projectId,
        sceneId: scene.id,
        shotId,
        stage: activeStage,
        fps: scene.fpsDefault,
        file
      });
      setStageVideos((current) => [
        {
          id: `local-${Date.now()}`,
          shotId,
          scope: "shot",
          versionNumber: result.versionNumber,
          stage: activeStage,
          status: "ready_for_review",
          fileName: file.name,
          duration: 0,
          fps: scene.fpsDefault,
          resolution: "",
          isFavorite: false,
          url: result.objectUrl
        },
        ...current
      ]);
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Error al subir el clip");
    } finally {
      setIsUploading(false);
      if (stageFileRef.current) stageFileRef.current.value = "";
    }
  }

  if (!activeShot) {
    return (
      <div className="p-5 text-sm text-muted">{t("scene.emptyShots")}</div>
    );
  }

  const hasTitle = activeShot.title.trim().length > 0;

  return (
    <div className="grid gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel>{t("scene.tabShot")}</FieldLabel>
          <p className="mt-1 truncate text-lg font-semibold text-fg-strong">
            {hasTitle ? activeShot.title : activeShot.shotNumber}
          </p>
        </div>
        <label className="grid shrink-0 gap-1">
          <span className="text-right text-[10px] font-medium uppercase tracking-wider text-muted">
            {t("scene.stage")}
          </span>
          <select
            className="h-8 rounded-md border border-line-strong bg-background px-2 text-[12px] font-medium text-fg disabled:opacity-60"
            disabled={!canEditScript}
            onChange={(event) => onUpdateScene({ stage: event.target.value })}
            value={scene.stage}
          >
            {sceneStages.map((item) => (
              <option key={item} value={item}>
                {optionLabel("sceneStages", item)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-1.5">
        <FieldLabel>{t("scene.reviewStatus")}</FieldLabel>
        <div className="flex items-center gap-2.5">
          {sceneStatuses.map((status) => {
            const selected = reviewStatus === status;
            return (
              <button
                aria-label={optionLabel("sceneStatuses", status)}
                aria-pressed={selected}
                className={[
                  "h-6 w-6 rounded-full border border-black/10 transition disabled:cursor-not-allowed",
                  selected
                    ? "scale-110 ring-2 ring-red-500 ring-offset-2 ring-offset-surface"
                    : "opacity-45 hover:opacity-100"
                ].join(" ")}
                disabled={!canEditScript}
                key={status}
                onClick={() => void persistStage({ reviewStatus: status })}
                style={{ backgroundColor: SCENE_STATUS_COLORS[status] ?? "#9ca3af" }}
                title={optionLabel("sceneStatuses", status)}
                type="button"
              />
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        <FieldLabel>{t("scene.title")}</FieldLabel>
        <TextInput
          disabled={!canEditScript}
          onChange={(value) => onUpdateShot(activeShot.id, { title: value })}
          value={activeShot.title}
        />
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

      <fieldset className="grid min-w-0 gap-2 rounded-md border border-line bg-background p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
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
        <FieldLabel>{t("scene.responsibles")}</FieldLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignees.map((id) => (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-line bg-background px-2 py-0.5 text-[11px] text-fg"
              key={id}
            >
              {memberName.get(id) ?? "—"}
              {canEditScript ? (
                <button
                  className="text-muted hover:text-danger-fg"
                  onClick={() => toggleAssignee(id)}
                  type="button"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          {canEditScript ? (
            <select
              className="h-7 rounded-md border border-line-strong bg-background px-1.5 text-[11px] text-muted"
              onChange={(event) => {
                if (event.target.value) toggleAssignee(event.target.value);
                event.currentTarget.selectedIndex = 0;
              }}
              value=""
            >
              <option value="">+ {t("scene.add")}</option>
              {projectMembers
                .filter((member) => !assignees.includes(member.id))
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
          ) : assignees.length === 0 ? (
            <span className="text-[11px] text-muted">{t("scene.noResponsibles")}</span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <FieldLabel>{t("scene.stageVideos")}</FieldLabel>
        <div className="grid gap-1.5">
          {stageClips.length === 0 ? (
            <p className="text-[11px] text-muted">{t("scene.noStageVideos")}</p>
          ) : (
            stageClips.map((clip) => (
              <a
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-background px-2.5 py-1.5 text-[11px] text-fg hover:bg-elevated"
                href={clip.url ?? "#"}
                key={clip.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="shrink-0 font-medium">▶ v{clip.versionNumber}</span>
                <span className="truncate text-[10px] text-muted">{clip.fileName}</span>
              </a>
            ))
          )}
          {canEditScript ? (
            <button
              className="rounded-md border border-line-strong px-2.5 py-1.5 text-[11px] font-medium text-muted-strong hover:bg-elevated disabled:opacity-60"
              disabled={isUploading}
              onClick={() => stageFileRef.current?.click()}
              type="button"
            >
              {isUploading ? t("scene.phaseUploadBusy") : `+ ${t("scene.uploadVersion")}`}
            </button>
          ) : null}
          {stageError ? <p className="text-[10px] text-danger-fg">{stageError}</p> : null}
        </div>
        <input
          accept="video/mp4"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleStageFile(file);
          }}
          ref={stageFileRef}
          type="file"
        />
      </div>

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
        <MultilineListField
          disabled={!canEditScript}
          onCommit={(next) => onUpdateShot(activeShot.id, { requiredElements: next })}
          value={activeShot.requiredElements}
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
      <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted">{label}</span>
      <input
        className="h-9 w-full min-w-0 rounded-md border border-line bg-background px-1.5 text-center text-[11px] tabular-nums text-fg focus:border-red-600/60 focus:outline-none focus:ring-1 focus:ring-red-600/30 disabled:opacity-60"
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

function ElementsTab(props: TimelineViewProps) {
  const {
    activeShot,
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

  // Asset tags ("elementos") belong to the selected shot.
  const shotTags = activeShot ? assetTags.filter((tag) => tag.shotId === activeShot.id) : [];

  if (!activeShot) {
    return (
      <div className="border-t border-line p-4 text-sm text-muted sm:p-5">{t("scene.phaseNoShot")}</div>
    );
  }

  return (
    <div className="grid gap-4 border-t border-line p-4 sm:p-5">
      <FieldLabel>{t("scene.elementsForShot", { shotNumber: activeShot.shotNumber })}</FieldLabel>
      {assetTagCategories.map((category) => {
        const categoryTags = shotTags.filter((tag) => tag.category === category);
        const datalistId = `${category}-asset-tags-sidebar`;
        return (
          <div className="grid gap-2" key={category}>
            <FieldLabel>{optionLabel("assetTagCategories", category)}</FieldLabel>
            {canEditScript ? (
              <form className="flex gap-2" onSubmit={(event) => void onAddAssetTag(event, category)}>
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-line bg-background px-2.5 text-sm text-fg"
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-background px-2 py-1 text-xs text-fg"
                  key={tag.id}
                >
                  {tag.name}
                  {canEditScript ? (
                    <button
                      className="text-[10px] font-semibold text-muted hover:text-danger-fg"
                      onClick={() => void onRemoveAssetTag(tag.id)}
                      type="button"
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))}
              {categoryTags.length === 0 ? (
                <p className="text-xs text-muted">{t("scene.noTags")}</p>
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
    activeShot,
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

  // Attachments are per shot: show only the active shot's files.
  const shotAttachments = activeShot
    ? attachments.filter((attachment) => attachment.shotId === activeShot.id)
    : [];

  if (!activeShot) {
    return (
      <div className="border-t border-line p-4 text-sm text-muted sm:p-5">{t("scene.phaseNoShot")}</div>
    );
  }

  return (
    <div className="grid gap-4 border-t border-line p-4 sm:p-5">
      <FieldLabel>{t("scene.attachmentsForShot", { shotNumber: activeShot.shotNumber })}</FieldLabel>
      <form className="grid gap-3 rounded-md border border-line bg-background p-3" onSubmit={onUploadAttachment}>
        <FieldLabel>{t("scene.title")}</FieldLabel>
        <TextInput onChange={setAttachmentTitle} value={attachmentTitle} />
        <FieldLabel>{t("scene.attachmentDate")}</FieldLabel>
        <TextInput onChange={setAttachmentDate} type="date" value={attachmentDate} />
        <FieldLabel>{t("scene.description")}</FieldLabel>
        <TextArea onChange={setAttachmentDescription} value={attachmentDescription} />
        <button
          className="rounded-md border border-dashed border-line-strong bg-background px-3 py-3 text-xs text-muted-strong hover:border-red-700 hover:bg-surface"
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
        {shotAttachments.map((attachment) => (
          <article className="rounded-md border border-line bg-background p-3 text-xs" key={attachment.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-fg-strong">{attachment.title}</p>
                <p className="mt-0.5 text-muted">
                  {formatDate(attachment.attachmentDate)} · {attachment.uploadedByName}
                </p>
              </div>
              <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] text-muted-strong">
                {attachment.fileSizeMb} MB
              </span>
            </div>
            {attachment.description ? (
              <p className="mt-1.5 text-muted">{attachment.description}</p>
            ) : null}
            {attachment.url ? (
              <a
                className="mt-2 inline-flex text-[11px] font-medium text-danger-fg hover:text-danger-fg"
                href={attachment.url}
                rel="noreferrer"
                target="_blank"
              >
                {t("scene.openFile", { fileName: attachment.fileName })}
              </a>
            ) : (
              <p className="mt-2 text-[11px] text-muted">{attachment.fileName}</p>
            )}
          </article>
        ))}
        {shotAttachments.length === 0 ? (
          <p className="text-xs text-muted">{t("scene.noAttachments")}</p>
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
  scene,
  shots,
  t
}: {
  canEditScript: boolean;
  onAddShotAfter: (shot: ShotData | null) => void;
  onRemoveShot: (id: string) => void;
  onUpdateShot: (id: string, patch: Partial<ShotData>) => void;
  scene: SceneData;
  shots: ShotData[];
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t("scene.tableSubtitle", { count: shots.length })}
        </p>
        {canEditScript ? (
          <button
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-elevated"
            onClick={() => onAddShotAfter(shots[shots.length - 1] ?? null)}
            type="button"
          >
            + {t("scene.addShot")}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 sm:px-7">
        <table className="w-full min-w-[1400px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {[
                t("scene.number"),
                t("scene.type"),
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
                  className="border-b border-line bg-surface/80 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted"
                  key={idx}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shots.map((shot) => (
              <tr className="hover:bg-surface/30" key={shot.id}>
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
                        className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted-strong hover:bg-elevated"
                        onClick={() => onAddShotAfter(shot)}
                        title={t("scene.addShot")}
                        type="button"
                      >
                        +
                      </button>
                      <button
                        className="rounded border border-danger px-1.5 py-0.5 text-[10px] text-danger-fg hover:bg-danger-soft"
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
                <td className="border-b border-line px-3 py-6 text-center text-muted" colSpan={13}>
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
  return <td className="border-b border-line bg-background/40 px-2 py-1.5 align-top">{children}</td>;
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
      className={`h-7 ${width} rounded border border-transparent bg-transparent px-1 text-xs text-fg focus:border-line-strong focus:bg-background focus:outline-none disabled:opacity-60`}
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
      className="min-h-7 w-72 resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-xs leading-4 text-fg focus:border-line-strong focus:bg-background focus:outline-none disabled:opacity-60"
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
      className="h-7 w-28 rounded border border-transparent bg-transparent px-1 text-xs tabular-nums text-fg focus:border-line-strong focus:bg-background focus:outline-none disabled:opacity-60"
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
  fps,
  isSubmitting,
  onCancel,
  onConfirm,
  request,
  t
}: {
  fps: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (keep: "left" | "right") => void;
  request: MergeRequest;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const preview = computeMergePreview(request);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-background shadow-2xl">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-fg-strong">{t("scene.mergeShots")}</h2>
          <p className="mt-1 text-xs text-muted">{t("scene.mergeHelp")}</p>
        </div>

        <div className="grid gap-2 border-b border-line px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("scene.mergePreview")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <PreviewTile label={t("scene.startTc")}>
              {framesToTimecode(preview.startFrame, fps)}
            </PreviewTile>
            <PreviewTile label={t("scene.endTc")}>
              {framesToTimecode(preview.endFrame, fps)}
            </PreviewTile>
            <PreviewTile label={t("scene.durationTc")}>
              {framesToTimecode(preview.durationFrames, fps)}
            </PreviewTile>
          </div>
          <p className="text-[10px] text-muted">
            {t("scene.mergePreviewHint", {
              left: `${formatTimeRange(request.leftStartFrame, request.leftEndFrame, fps)}`,
              right: `${formatTimeRange(request.rightStartFrame, request.rightEndFrame, fps)}`
            })}
          </p>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <button
            className="flex flex-col items-start gap-1 rounded-md border border-line bg-surface p-4 text-left text-sm transition hover:border-red-600 hover:bg-red-600/10 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => onConfirm("left")}
            type="button"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.mergeKeepLeft")}
            </span>
            <span className="font-semibold text-fg">{request.leftLabel}</span>
            <span className="text-[11px] text-muted">{t("scene.mergeKeepHint")}</span>
          </button>
          <button
            className="flex flex-col items-start gap-1 rounded-md border border-line bg-surface p-4 text-left text-sm transition hover:border-red-600 hover:bg-red-600/10 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => onConfirm("right")}
            type="button"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.mergeKeepRight")}
            </span>
            <span className="font-semibold text-fg">{request.rightLabel}</span>
            <span className="text-[11px] text-muted">{t("scene.mergeKeepHint")}</span>
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-elevated disabled:opacity-50"
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

function AddShotModal({
  fps,
  onCancel,
  onConfirm,
  request,
  t
}: {
  fps: number;
  onCancel: () => void;
  onConfirm: (data: {
    startFrame: number;
    durationFrames: number;
    shotType: string;
    description: string;
  }) => void;
  request: AddShotRequest;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const [startTc, setStartTc] = useState(() => framesToTimecode(request.defaultStartFrame, fps));
  const [durationTc, setDurationTc] = useState(() => framesToTimecode(2 * fps, fps));
  const [shotType, setShotType] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const startFrame = parseTimecode(startTc, fps);
  const durationFrames = parseTimecode(durationTc, fps);
  const valid =
    startFrame !== null && startFrame >= 0 && durationFrames !== null && durationFrames > 0;
  const endFrame = valid ? (startFrame as number) + (durationFrames as number) : null;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onConfirm({
      startFrame: startFrame as number,
      durationFrames: durationFrames as number,
      shotType: shotType.trim(),
      description: description.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-line bg-background shadow-2xl">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-fg-strong">{t("scene.addShotTitle")}</h2>
          <p className="mt-1 text-xs text-muted">{t("scene.addShotHelp")}</p>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("scene.addShotStart")}
              </span>
              <input
                className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm tabular-nums text-fg focus:border-red-600/60 focus:outline-none"
                onChange={(event) => setStartTc(event.target.value)}
                placeholder="00:00:00:00"
                value={startTc}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("scene.addShotDuration")}
              </span>
              <input
                className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm tabular-nums text-fg focus:border-red-600/60 focus:outline-none"
                onChange={(event) => setDurationTc(event.target.value)}
                placeholder="00:00:02:00"
                value={durationTc}
              />
            </label>
          </div>

          <div className="rounded-md border border-line bg-surface px-3 py-2 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.addShotEnd")}
            </p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-fg">
              {endFrame !== null ? framesToTimecode(endFrame, fps) : "—"}
            </p>
          </div>

          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.type")}
            </span>
            <input
              className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-fg focus:border-red-600/60 focus:outline-none"
              onChange={(event) => setShotType(event.target.value)}
              value={shotType}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t("scene.description")}
            </span>
            <textarea
              className="min-h-20 resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-sm leading-5 text-fg focus:border-red-600/60 focus:outline-none"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>

          {touched && !valid ? (
            <p className="text-[11px] text-danger-fg">{t("scene.addShotInvalid")}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-elevated"
            onClick={onCancel}
            type="button"
          >
            {t("scene.cancel")}
          </button>
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            disabled={touched && !valid}
            onClick={submit}
            type="button"
          >
            {t("scene.addShotInsert")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteSceneModal({
  onCancel,
  projectId,
  sceneId,
  sceneNumber,
  sceneTitle,
  t
}: {
  onCancel: () => void;
  projectId: string;
  sceneId: string;
  sceneNumber: string;
  sceneTitle: string;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const phraseMatches = confirmation.trim().toLowerCase() === "acepto borrar";

  async function startDelete() {
    if (!phraseMatches || isDeleting) return;
    setIsDeleting(true);
    setError("");
    setProgress(0);
    setLabel("");
    try {
      const response = await fetch(`/api/scenes/${sceneId}/with-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation })
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("scene.deleteSceneError"));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as {
              phase: string;
              progress?: number;
              label?: string;
              error?: string;
            };
            if (msg.phase === "error") {
              throw new Error(msg.error ?? t("scene.deleteSceneError"));
            }
            if (typeof msg.progress === "number") setProgress(msg.progress);
            if (msg.label) setLabel(msg.label);
            if (msg.phase === "done") {
              setDone(true);
              setLabel(t("scene.deleteSceneSuccess"));
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message) throw parseError;
          }
        }
      }
      // After stream closes successfully, navigate back to project
      setTimeout(() => router.push(`/projects/${projectId}`), 800);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("scene.deleteSceneError"));
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-danger bg-background shadow-2xl">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-danger-fg">{t("scene.deleteSceneTitle")}</h2>
          <p className="mt-1 text-xs text-muted">{t("scene.deleteSceneHelp")}</p>
          <p className="mt-2 text-[11px] text-muted">
            {t("scene.scene")} {sceneNumber} · {sceneTitle}
          </p>
        </div>

        {!isDeleting && !done ? (
          <div className="grid gap-3 px-5 py-4">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("scene.deleteSceneConfirmLabel")}
              </span>
              <input
                autoFocus
                className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-fg focus:border-red-600/60 focus:outline-none"
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={t("scene.deleteSceneConfirmPlaceholder")}
                value={confirmation}
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-2 px-5 py-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className={`h-full transition-all duration-200 ${done ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-muted-strong">
              {Math.round(progress)}% · {label || "..."}
            </p>
          </div>
        )}

        {error ? (
          <p className="mx-5 mb-2 rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger-fg">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted-strong hover:bg-elevated disabled:opacity-50"
            disabled={isDeleting && !done && !error}
            onClick={onCancel}
            type="button"
          >
            {t("scene.cancel")}
          </button>
          {!done ? (
            <button
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!phraseMatches || isDeleting}
              onClick={startDelete}
              type="button"
            >
              {t("scene.deleteSceneStart")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-2 py-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-fg">{children}</p>
    </div>
  );
}

function formatTimeRange(start: number | null, end: number | null, fps: number) {
  if (start === null && end === null) return "—";
  const safeStart = start ?? 0;
  const safeEnd = end ?? safeStart;
  return `${framesToTimecode(safeStart, fps)} → ${framesToTimecode(safeEnd, fps)}`;
}

function computeMergePreview(req: MergeRequest) {
  const starts = [req.leftStartFrame, req.rightStartFrame].filter(
    (value): value is number => typeof value === "number"
  );
  const ends = [req.leftEndFrame, req.rightEndFrame].filter(
    (value): value is number => typeof value === "number"
  );

  let startFrame = starts.length > 0 ? Math.min(...starts) : null;
  let endFrame = ends.length > 0 ? Math.max(...ends) : null;

  const leftHasRange = req.leftStartFrame !== null && req.leftEndFrame !== null;
  const rightHasRange = req.rightStartFrame !== null && req.rightEndFrame !== null;
  if (leftHasRange && !rightHasRange && (req.rightDurationFrames ?? 0) > 0) {
    endFrame = (endFrame ?? 0) + (req.rightDurationFrames ?? 0);
  } else if (!leftHasRange && rightHasRange && (req.leftDurationFrames ?? 0) > 0) {
    startFrame = Math.max(0, (startFrame ?? 0) - (req.leftDurationFrames ?? 0));
  }

  let durationFrames: number | null = null;
  if (startFrame !== null && endFrame !== null && endFrame >= startFrame) {
    durationFrames = endFrame - startFrame;
  } else {
    const sum = (req.leftDurationFrames ?? 0) + (req.rightDurationFrames ?? 0);
    durationFrames = sum > 0 ? sum : null;
  }

  return { startFrame, endFrame, durationFrames };
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
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">
              {t("scene.scene")} {scene.sceneNumber} · {t("scene.literaryScript")}
              {canEdit ? <span className="ml-2 text-muted">· {t("scene.adminEditEnabled")}</span> : null}
            </p>
            {scene.literaryHeading ? (
              <h2 className="mt-1 truncate text-base font-semibold text-fg-strong">{scene.literaryHeading}</h2>
            ) : scene.title ? (
              <h2 className="mt-1 truncate text-base font-semibold text-fg-strong">{scene.title}</h2>
            ) : null}
          </div>
          <button
            aria-label={t("scene.cancel")}
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-elevated hover:text-fg"
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
            <p className="text-sm italic text-muted">{t("scene.missingLiteraryScript")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface/40 px-6 py-2 text-[11px] text-muted">
          <span>{t("scene.scriptShortcutHint")}</span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-strong">G</kbd>
            <span>·</span>
            <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-strong">Esc</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
