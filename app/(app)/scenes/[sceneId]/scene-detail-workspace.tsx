"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type UIEvent } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  assetTagCategories,
  sceneSoundOptions,
  shotStatuses,
  type AssetTagCategory,
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
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function splitElements(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function framesToTimeParts(totalFrames: number | null, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));
  const frames = Math.max(0, totalFrames ?? 0);
  const minutes = Math.floor(frames / (safeFps * 60));
  const seconds = Math.floor((frames - minutes * safeFps * 60) / safeFps);
  const remainingFrames = frames % safeFps;

  return { minutes, seconds, frames: remainingFrames };
}

function timePartsToFrames(parts: { minutes: number; seconds: number; frames: number }, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));

  return Math.max(0, parts.minutes) * 60 * safeFps + Math.max(0, parts.seconds) * safeFps + Math.max(0, parts.frames);
}

function readNumber(value: string) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

const summaryStopWords = new Set([
  "a",
  "al",
  "ante",
  "bajo",
  "con",
  "contra",
  "de",
  "del",
  "desde",
  "durante",
  "el",
  "ella",
  "ellos",
  "en",
  "entre",
  "es",
  "esa",
  "ese",
  "esta",
  "este",
  "la",
  "las",
  "le",
  "lo",
  "los",
  "mas",
  "mientras",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "sin",
  "sobre",
  "su",
  "sus",
  "un",
  "una",
  "unas",
  "unos",
  "y"
]);

function summarizeLiteraryScript(text: string) {
  const normalizedText = text
    .replace(/\b[A-ZÁÉÍÓÚÑ]{2,}\s+-/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return "";
  }

  const sentences = normalizedText
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 32);

  if (sentences.length <= 2) {
    return normalizedText;
  }

  const termFrequency = new Map<string, number>();

  for (const word of normalizedText.toLowerCase().match(/\p{L}{4,}/gu) ?? []) {
    const normalizedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (!summaryStopWords.has(normalizedWord)) {
      termFrequency.set(normalizedWord, (termFrequency.get(normalizedWord) ?? 0) + 1);
    }
  }

  const rankedSentences = sentences
    .map((sentence, index) => {
      const words = sentence.toLowerCase().match(/\p{L}{4,}/gu) ?? [];
      const keywordScore =
        words.reduce((total, word) => {
          const normalizedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return total + (termFrequency.get(normalizedWord) ?? 0);
        }, 0) / Math.max(1, words.length);
      const positionScore = Math.max(0, 1 - index / Math.max(1, sentences.length));
      const lengthScore = sentence.length > 70 && sentence.length < 210 ? 0.6 : 0;
      const dialoguePenalty = sentence.includes(" -") || /^[A-ZÁÉÍÓÚÑ]{2,}\b/.test(sentence) ? 0.75 : 0;
      const score = keywordScore + positionScore + lengthScore - dialoguePenalty;

      return { index, score, sentence };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index);

  return rankedSentences
    .map((item) => item.sentence)
    .join(". ")
    .slice(0, 260);
}

function getNextShotNumber(shots: ShotData[]) {
  const numericShotNumbers = shots
    .map((shot) => Number.parseInt(shot.shotNumber, 10))
    .filter(Number.isFinite);

  if (numericShotNumbers.length === 0) {
    return "1";
  }

  return String(Math.max(...numericShotNumbers) + 1);
}

function createEmptyShot(shots: ShotData[]): ShotData {
  return {
    id: `new-${crypto.randomUUID()}`,
    shotNumber: getNextShotNumber(shots),
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
  initialShotId
}: SceneDetailWorkspaceProps) {
  const { optionLabel, t } = useI18n();
  const [scene, setScene] = useState(initialScene);
  const [shots, setShots] = useState(initialShots);
  const [videos, setVideos] = useState(initialVideos);
  const [activeShotId, setActiveShotId] = useState(initialShotId ?? initialShots[0]?.id ?? "");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [humanResources, setHumanResources] = useState(initialHumanResources);
  const [assetTags, setAssetTags] = useState(initialAssetTags);
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
  const [selectedResourceUserId, setSelectedResourceUserId] = useState("");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDate, setAttachmentDate] = useState(todayInputValue());
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [scriptStatus, setScriptStatus] = useState("");
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [resourceStatus, setResourceStatus] = useState("");
  const [tagStatus, setTagStatus] = useState("");
  const [error, setError] = useState("");
  const [isCompactHeaderVisible, setIsCompactHeaderVisible] = useState(false);
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState<AssetTagCategory | "">("");
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const normalVideoSlotRef = useRef<HTMLDivElement>(null);
  const compactVideoSlotRef = useRef<HTMLDivElement>(null);
  const movableVideoFrameRef = useRef<HTMLDivElement>(null);

  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? shots[0] ?? null;
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
  const literarySummary = useMemo(
    () => summarizeLiteraryScript(scene.literaryScript || scene.description),
    [scene.description, scene.literaryScript]
  );

  useLayoutEffect(() => {
    setIsCompactHeaderVisible(false);

    if (workspaceRef.current) {
      workspaceRef.current.scrollTop = 0;
    }
  }, [scene.id]);

  useLayoutEffect(() => {
    const videoFrame = movableVideoFrameRef.current;
    const normalSlot = normalVideoSlotRef.current;
    const compactSlot = compactVideoSlotRef.current;

    if (!videoFrame || !normalSlot) {
      return;
    }

    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const targetSlot = isDesktop && isCompactHeaderVisible && compactSlot ? compactSlot : normalSlot;

    if (videoFrame.parentElement !== targetSlot) {
      targetSlot.appendChild(videoFrame);
    }
  }, [isCompactHeaderVisible]);

  function renderMovableVideoFrame() {
    return (
      <div
        className={[
          "grid aspect-video place-items-center bg-black",
          isCompactHeaderVisible
            ? "w-[320pt] max-w-full shrink-0 overflow-hidden rounded-md border border-neutral-800"
            : ""
        ].join(" ")}
        ref={movableVideoFrameRef}
      >
        {activeVideo?.url ? (
          <video className="h-full w-full object-contain" controls key={activeVideo.id} src={activeVideo.url} />
        ) : (
          <div className="px-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-neutral-700 bg-neutral-900">
              <div className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-slate-400" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-100">{t("scene.noPreviewTitle")}</p>
            <p className="mt-2 text-sm text-slate-400">{t("scene.noPreviewBody")}</p>
          </div>
        )}
      </div>
    );
  }

  function renderVideoPanel() {
    return (
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black shadow-lg shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 text-white">
          <div>
            <p className="text-xs uppercase text-slate-400">{t("scene.loadedVideo")}</p>
            <p className="mt-1 text-sm font-medium">
              {activeVideo
                ? `${optionLabel("productionStages", activeVideo.stage)} v${activeVideo.versionNumber} · ${activeVideo.resolution}`
                : t("scene.noVideoSelection")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {availableVideos.length > 1 ? (
              <select
                className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-white"
                onChange={(event) => setSelectedVideoId(event.target.value)}
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
            {canManageVideos && activeVideo ? (
              <button
                className="h-9 rounded-md border border-red-900/70 px-3 text-sm font-medium text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeletingVideo}
                onClick={() => void deleteActiveVideo()}
                type="button"
              >
                {isDeletingVideo ? t("scene.deletingVideo") : t("scene.deleteVideo")}
              </button>
            ) : null}
          </div>
        </div>
        <div ref={normalVideoSlotRef}>
          {renderMovableVideoFrame()}
        </div>
      </div>
    );
  }

  function handleWorkspaceScroll(event: UIEvent<HTMLDivElement>) {
    const shouldShowCompactHeader = window.matchMedia("(min-width: 1024px)").matches && event.currentTarget.scrollTop > 120;
    setIsCompactHeaderVisible((current) =>
      current === shouldShowCompactHeader ? current : shouldShowCompactHeader
    );
  }

  async function deleteActiveVideo() {
    if (!canManageVideos || !activeVideo || isDeletingVideo) {
      return;
    }

    if (!window.confirm(t("scene.deleteVideoConfirm"))) {
      return;
    }

    setError("");
    setScriptStatus("");
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
      setScriptStatus(t("scene.videoDeleted"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("scene.deleteVideoError"));
    } finally {
      setIsDeletingVideo(false);
    }
  }

  function updateShot(shotId: string, patch: Partial<ShotData>) {
    setShots((current) => current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)));
  }

  function updateShotDuration(shot: ShotData, part: "minutes" | "seconds" | "frames", value: string) {
    const fps = Math.max(1, Math.round(scene.fpsDefault));
    const currentParts = framesToTimeParts(shot.durationFrames, fps);
    const parsedValue = readNumber(value);
    const nextParts = {
      ...currentParts,
      [part]: part === "frames" ? Math.min(parsedValue, fps - 1) : part === "seconds" ? Math.min(parsedValue, 59) : parsedValue
    };

    updateShot(shot.id, { durationFrames: timePartsToFrames(nextParts, fps) });
  }

  function addShot() {
    const shot = createEmptyShot(shots);
    setShots((current) => [...current, shot]);
    setActiveShotId(shot.id);
    setSelectedVideoId("");
  }

  function removeShot(shotId: string) {
    if (!window.confirm(t("scene.removeShotConfirm"))) {
      return;
    }

    const nextShots = shots.filter((shot) => shot.id !== shotId);
    setShots(nextShots);

    if (activeShotId === shotId) {
      setActiveShotId(nextShots[0]?.id ?? "");
      setSelectedVideoId("");
    }
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
  }

  async function loadTagSuggestions(category: AssetTagCategory, value: string) {
    const response = await fetch(
      `/api/projects/${scene.projectId}/asset-tags?category=${category}&q=${encodeURIComponent(value)}`
    );

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { tags: AssetTagSuggestion[] };
    setTagSuggestions((current) => ({ ...current, [category]: payload.tags }));
  }

  function updateTagInput(category: AssetTagCategory, value: string) {
    setTagInputs((current) => ({ ...current, [category]: value }));
    void loadTagSuggestions(category, value);
  }

  async function addAssetTag(event: FormEvent<HTMLFormElement>, category: AssetTagCategory) {
    event.preventDefault();

    if (!canEditScript || !tagInputs[category].trim()) {
      return;
    }

    setError("");
    setTagStatus("");
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
      setTagStatus(t("scene.tagAssigned"));
    } catch (tagError) {
      setError(tagError instanceof Error ? tagError.message : t("scene.tagAssigned"));
    } finally {
      setIsSavingTag("");
    }
  }

  async function removeAssetTag(assignmentId: string) {
    if (!canEditScript) {
      return;
    }

    setError("");
    setTagStatus("");

    const response = await fetch(`/api/scenes/${scene.id}/asset-tags/${assignmentId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("scene.tagRemoved"));
      return;
    }

    setAssetTags((current) => current.filter((tag) => tag.id !== assignmentId));
    setTagStatus(t("scene.tagRemoved"));
  }

  async function addHumanResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageResources || !selectedResourceUserId) {
      return;
    }

    setError("");
    setResourceStatus("");
    setIsSavingResource(true);

    try {
      const response = await fetch(`/api/scenes/${scene.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedResourceUserId })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("scene.assignResponsible"));
      }

      const payload = (await response.json()) as { resource: HumanResourceData };
      setHumanResources((current) =>
        current.some((resource) => resource.id === payload.resource.id) ? current : [...current, payload.resource]
      );
      setSelectedResourceUserId("");
      setResourceStatus(t("scene.responsibleAssigned"));
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : t("scene.assignResponsible"));
    } finally {
      setIsSavingResource(false);
    }
  }

  async function removeHumanResource(resourceId: string) {
    if (!canManageResources) {
      return;
    }

    setError("");
    setResourceStatus("");

    const response = await fetch(`/api/scenes/${scene.id}/resources/${resourceId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? t("scene.responsibleRemoved"));
      return;
    }

    setHumanResources((current) => current.filter((resource) => resource.id !== resourceId));
    setResourceStatus(t("scene.responsibleRemoved"));
  }

  async function saveScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditScript) {
      return;
    }

    setError("");
    setScriptStatus("");
    setIsSavingScript(true);

    try {
      const response = await fetch(`/api/scenes/${scene.id}/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: {
            title: scene.title,
            description: scene.description,
            location: scene.location,
            timeOfDay: scene.timeOfDay,
            soundOptions: scene.soundOptions
          },
          shots: shots.map((shot) => ({
            ...shot,
            id: shot.id.startsWith("new-") ? undefined : shot.id
          }))
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("scene.saveScript"));
      }

      const payload = (await response.json()) as { shots?: ShotData[] };

      if (payload.shots) {
        setShots(payload.shots);
        setActiveShotId((current) =>
          payload.shots?.some((shot) => shot.id === current) ? current : payload.shots?.[0]?.id ?? ""
        );
      }

      setScriptStatus(t("scene.scriptSaved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("scene.saveScript"));
    } finally {
      setIsSavingScript(false);
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAttachmentStatus("");

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
        const s3Error = await uploadResponse.text().catch(() => "");
        throw new Error(
          `S3 rechazo la subida del adjunto. (${uploadResponse.status})${s3Error ? `: ${s3Error}` : ""}`
        );
      }

      const completeResponse = await fetch(`/api/scenes/${scene.id}/attachments/${initPayload.uploadId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploaded: true,
          etag: uploadResponse.headers.get("etag") ?? undefined
        })
      });

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
      setAttachmentStatus(t("scene.attachmentAdded"));

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("scene.uploading"));
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto" onScroll={handleWorkspaceScroll} ref={workspaceRef}>
      <div
        className={[
          "fixed left-0 right-0 top-16 z-30 hidden border-b border-neutral-800 bg-black/95 px-5 py-3 shadow-lg shadow-black/30 transition sm:px-7 lg:block",
          isCompactHeaderVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
        ].join(" ")}
      >
          <div className="grid gap-4 lg:grid-cols-[320pt_minmax(0,1fr)] lg:items-center">
            <div ref={compactVideoSlotRef} />
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {t("scene.scene")} {scene.sceneNumber}
                </p>
                <h2 className="mt-1 line-clamp-1 text-xl font-semibold text-slate-50">{scene.title}</h2>
                {literarySummary ? (
                  <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-5 text-slate-400">
                    {literarySummary}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-slate-200 hover:bg-neutral-900"
                  href={`/api/scenes/${scene.id}/assets/download`}
                >
                  {t("scene.downloadAssetsZip")}
                </a>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800"
                  href={`/upload?projectId=${scene.projectId}&sceneId=${scene.id}`}
                >
                  {t("scene.uploadVideo")}
                </Link>
                {canManageVideos && activeVideo ? (
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-red-900/70 px-4 text-sm font-medium text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isDeletingVideo}
                    onClick={() => void deleteActiveVideo()}
                    type="button"
                  >
                    {isDeletingVideo ? t("scene.deletingVideo") : t("scene.deleteVideo")}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

      <section className="border-b border-neutral-800 bg-black px-5 py-4 sm:px-7">
        <Link className="text-sm font-medium text-red-300 hover:text-red-200" href={`/projects/${scene.projectId}`}>
          {t("scene.backToProject")}
        </Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              {t("scene.scene")} {scene.sceneNumber}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">{scene.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{scene.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-slate-200 hover:bg-neutral-900"
              href={`/api/scenes/${scene.id}/assets/download`}
            >
              {t("scene.downloadAssetsZip")}
            </a>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800"
              href={`/upload?projectId=${scene.projectId}&sceneId=${scene.id}`}
            >
              {t("scene.uploadVideo")}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 px-5 py-5 sm:px-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
          {renderVideoPanel()}

          <section className="grid gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">{t("scene.literaryScript")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {scene.literaryHeading || `${t("scene.scene")} ${scene.sceneNumber}`}
              </p>
            </div>
            {scene.literaryScript ? (
              <div className="max-h-[520px] overflow-y-auto rounded-md border border-neutral-800 bg-black p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{scene.literaryScript}</p>
              </div>
            ) : (
              <p className="rounded-md border border-neutral-800 bg-black/40 p-4 text-sm text-slate-400">
                {t("scene.missingLiteraryScript")}
              </p>
            )}
          </section>

          <form className="grid gap-5 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30" onSubmit={saveScript}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">{t("scene.technicalScript")}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {canEditScript ? t("scene.adminEditEnabled") : t("scene.readOnly")}
                </p>
              </div>
              {canEditScript ? (
                <button
                  className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  disabled={isSavingScript}
                  type="submit"
                >
                  {isSavingScript ? t("scene.saving") : t("scene.saveScript")}
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                {t("scene.title")}
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, title: event.target.value }))}
                  value={scene.title}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                {t("scene.location")}
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, location: event.target.value }))}
                  value={scene.location}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                {t("scene.timeOfDay")}
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, timeOfDay: event.target.value }))}
                  value={scene.timeOfDay}
                />
              </label>
              <fieldset className="grid gap-3 rounded-md border border-neutral-800 bg-black/40 p-4 md:col-span-2">
                <legend className="px-1 text-sm font-medium text-slate-300">{t("scene.sound")}</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {sceneSoundOptions.map((option) => (
                    <label
                      className="flex min-h-10 items-center gap-3 rounded-md border border-neutral-800 bg-black px-3 text-sm font-medium text-slate-300"
                      key={option}
                    >
                      <input
                        checked={scene.soundOptions.includes(option)}
                        className="h-4 w-4 accent-red-900"
                        disabled={!canEditScript}
                        onChange={(event) => toggleSceneSoundOption(option, event.target.checked)}
                        type="checkbox"
                      />
                      {optionLabel("sceneSoundOptions", option)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                {t("scene.dramaticIntent")}
                <textarea
                  className="min-h-24 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                  disabled={!canEditScript}
                  onChange={(event) => setScene((current) => ({ ...current, description: event.target.value }))}
                  value={scene.description}
                />
              </label>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase text-slate-400">{t("scene.shots")}</h3>
                {canEditScript ? (
                  <button
                    className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-slate-200 hover:bg-neutral-800"
                    onClick={addShot}
                    type="button"
                  >
                    {t("scene.addShot")}
                  </button>
                ) : null}
              </div>
              {shots.map((shot) => {
                const duration = framesToTimeParts(shot.durationFrames, scene.fpsDefault);

                return (
                <article
                  className={`rounded-lg border p-4 ${shot.id === activeShot?.id ? "border-red-900/70 bg-neutral-950" : "border-neutral-800 bg-black/40"}`}
                  key={shot.id}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <button
                      className="text-left"
                      onClick={() => {
                        setActiveShotId(shot.id);
                        setSelectedVideoId("");
                      }}
                      type="button"
                    >
                      <p className="text-xs font-semibold uppercase text-slate-500">Shot {shot.shotNumber}</p>
                      <h3 className="mt-1 font-semibold text-slate-50">{shot.shotType || "-"}</h3>
                    </button>
                    {canEditScript ? (
                      <button
                        className="rounded-md border border-red-900/70 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/30"
                        onClick={() => removeShot(shot.id)}
                        type="button"
                      >
                        {t("scene.remove")}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.number")}
                      <input
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { shotNumber: event.target.value })}
                        value={shot.shotNumber}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.type")}
                      <input
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { shotType: event.target.value })}
                        value={shot.shotType}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.status")}
                      <select
                        className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { status: event.target.value as ShotStatus })}
                        value={shot.status}
                      >
                        {shotStatuses.map((item) => (
                          <option key={item} value={item}>
                            {optionLabel("shotStatuses", item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="grid gap-3 rounded-md border border-neutral-800 bg-black/40 p-4 md:col-span-2">
                      <legend className="px-1 text-sm font-medium text-slate-300">
                        {t("scene.time")}{" "}
                        <span className="text-xs font-normal text-slate-500">({scene.fpsDefault} fps)</span>
                      </legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="grid gap-2 text-xs font-medium uppercase text-slate-500">
                          {t("scene.minutes")}
                          <input
                            className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-sm text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                            disabled={!canEditScript}
                            min={0}
                            onChange={(event) => updateShotDuration(shot, "minutes", event.target.value)}
                            type="number"
                            value={duration.minutes}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-medium uppercase text-slate-500">
                          {t("scene.seconds")}
                          <input
                            className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-sm text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                            disabled={!canEditScript}
                            max={59}
                            min={0}
                            onChange={(event) => updateShotDuration(shot, "seconds", event.target.value)}
                            type="number"
                            value={duration.seconds}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-medium uppercase text-slate-500">
                          {t("scene.frames")}
                          <input
                            className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-sm text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                            disabled={!canEditScript}
                            max={Math.max(0, Math.round(scene.fpsDefault) - 1)}
                            min={0}
                            onChange={(event) => updateShotDuration(shot, "frames", event.target.value)}
                            type="number"
                            value={duration.frames}
                          />
                        </label>
                      </div>
                    </fieldset>
                    <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                      {t("scene.description")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { description: event.target.value })}
                        value={shot.description}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.action")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { action: event.target.value })}
                        value={shot.action}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.camera")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { camera: event.target.value })}
                        value={shot.camera}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.soundTransition")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { sound: event.target.value })}
                        value={shot.sound}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                      {t("scene.requiredElements")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { requiredElements: splitElements(event.target.value) })}
                        value={shot.requiredElements.join("\n")}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2">
                      {t("scene.productionNotes")}
                      <textarea
                        className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100 disabled:bg-neutral-900 disabled:text-slate-400"
                        disabled={!canEditScript}
                        onChange={(event) => updateShot(shot.id, { productionNotes: event.target.value })}
                        value={shot.productionNotes}
                      />
                    </label>
                  </div>
                </article>
                );
              })}
              {shots.length === 0 ? (
                <p className="rounded-md border border-neutral-800 bg-black/40 p-4 text-sm text-slate-400">
                  {t("scene.emptyShots")}
                </p>
              ) : null}
            </div>

            {scriptStatus ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{scriptStatus}</p> : null}
          </form>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-50">{t("scene.responsibles")}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {canManageResources
                    ? t("scene.assignResponsiblesHint")
                    : t("scene.assignedResponsiblesHint")}
                </p>
              </div>
            </div>

            {canManageResources ? (
              <form className="mt-4 grid gap-3" onSubmit={addHumanResource}>
                <label className="grid gap-2 text-sm font-medium text-slate-300">
                  {t("scene.responsible")}
                  <select
                    className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100 disabled:opacity-60"
                    disabled={availableResourceMembers.length === 0 || isSavingResource}
                    onChange={(event) => setSelectedResourceUserId(event.target.value)}
                    value={selectedResourceUserId}
                  >
                    <option value="">{t("scene.selectResponsible")}</option>
                    {availableResourceMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  disabled={!selectedResourceUserId || isSavingResource}
                  type="submit"
                >
                  {isSavingResource ? t("scene.assigning") : t("scene.assignResponsible")}
                </button>
              </form>
            ) : null}

            <div className="mt-4 grid gap-2">
              {humanResources.map((resource) => (
                <article
                  className="rounded-md border border-neutral-800 bg-black/40 p-3 text-sm"
                  key={resource.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-50">{resource.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{resource.email}</p>
                      <p className="mt-2 text-xs font-medium uppercase text-red-300">{resource.role}</p>
                    </div>
                    {canManageResources ? (
                      <button
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-neutral-800"
                        onClick={() => void removeHumanResource(resource.id)}
                        type="button"
                      >
                        {t("scene.remove")}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {humanResources.length === 0 ? (
                <p className="rounded-md border border-neutral-800 bg-black/40 p-3 text-sm text-slate-400">
                  {t("scene.noResponsibles")}
                </p>
              ) : null}
            </div>

            {resourceStatus ? (
              <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                {resourceStatus}
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <div>
              <h2 className="font-semibold text-slate-50">{t("scene.sceneElements")}</h2>
              <p className="mt-1 text-sm text-slate-400">{t("scene.sceneElementsHint")}</p>
            </div>

            <div className="mt-4 grid gap-5">
              {assetTagCategories.map((category) => {
                const categoryTags = assetTags.filter((tag) => tag.category === category);
                const datalistId = `${category}-asset-tags`;

                return (
                  <div className="grid gap-3" key={category}>
                    <h3 className="text-xs font-semibold uppercase text-slate-500">
                      {optionLabel("assetTagCategories", category)}
                    </h3>
                    {canEditScript ? (
                      <form className="flex gap-2" onSubmit={(event) => void addAssetTag(event, category)}>
                        <label className="sr-only" htmlFor={`${category}-tag-input`}>
                          {optionLabel("assetTagCategories", category)}
                        </label>
                        <input
                          className="h-10 min-w-0 flex-1 rounded-md border border-neutral-700 bg-black px-3 text-sm text-slate-100"
                          id={`${category}-tag-input`}
                          list={datalistId}
                          onChange={(event) => updateTagInput(category, event.target.value)}
                          placeholder={t("scene.writeOrSelect")}
                          value={tagInputs[category]}
                        />
                        <datalist id={datalistId}>
                          {tagSuggestions[category].map((tag) => (
                            <option key={tag.id} value={tag.name} />
                          ))}
                        </datalist>
                        <button
                          className="h-10 rounded-md bg-red-900 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                          disabled={isSavingTag === category || !tagInputs[category].trim()}
                          type="submit"
                        >
                          {t("scene.add")}
                        </button>
                      </form>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {categoryTags.map((tag) => (
                        <span
                          className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-black px-2 py-1 text-sm text-slate-300"
                          key={tag.id}
                        >
                          {tag.name}
                          {canEditScript ? (
                            <button
                              className="text-xs font-semibold text-red-300 hover:text-red-200"
                              onClick={() => void removeAssetTag(tag.id)}
                              type="button"
                            >
                              {t("scene.remove")}
                            </button>
                          ) : null}
                        </span>
                      ))}
                      {categoryTags.length === 0 ? (
                        <p className="text-sm text-slate-500">{t("scene.noTags")}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {tagStatus ? (
              <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                {tagStatus}
              </p>
            ) : null}
          </section>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <h2 className="font-semibold text-slate-50">{t("scene.shots")}</h2>
            <div className="mt-4 grid gap-2">
              {shots.map((shot) => (
                <button
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    shot.id === activeShot?.id
                      ? "border-red-900/70 bg-neutral-950 text-red-100"
                      : "border-neutral-800 bg-black/40 text-slate-300 hover:border-neutral-700"
                  }`}
                  key={shot.id}
                  onClick={() => {
                    setActiveShotId(shot.id);
                    setSelectedVideoId("");
                  }}
                  type="button"
                >
                  <span className="font-semibold">Shot {shot.shotNumber}</span>
                  {shot.shotType ? <span className="text-slate-500"> · {shot.shotType}</span> : null}
                  <span className="mt-1 block text-xs text-slate-500">
                    {optionLabel("shotStatuses", shot.status)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form className="grid gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30" onSubmit={uploadAttachment}>
            <h2 className="font-semibold text-slate-50">{t("scene.attachments")}</h2>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              {t("scene.title")}
              <input
                className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
                onChange={(event) => setAttachmentTitle(event.target.value)}
                value={attachmentTitle}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              {t("scene.attachmentDate")}
              <input
                className="h-10 rounded-md border border-neutral-700 bg-black px-3 text-slate-100"
                onChange={(event) => setAttachmentDate(event.target.value)}
                type="date"
                value={attachmentDate}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              {t("scene.description")}
              <textarea
                className="min-h-20 rounded-md border border-neutral-700 bg-black px-3 py-2 text-slate-100"
                onChange={(event) => setAttachmentDescription(event.target.value)}
                value={attachmentDescription}
              />
            </label>
            <button
              className="rounded-md border-2 border-dashed border-neutral-700 bg-black px-4 py-5 text-center text-sm text-slate-300 hover:border-red-800 hover:bg-neutral-900"
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
              className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              disabled={isUploadingAttachment}
              type="submit"
            >
              {isUploadingAttachment ? t("scene.uploading") : t("scene.addAttachment")}
            </button>
            {attachmentStatus ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{attachmentStatus}</p> : null}
          </form>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-lg shadow-black/30">
            <h2 className="font-semibold text-slate-50">{t("scene.fileList")}</h2>
            <div className="mt-4 grid gap-3">
              {attachments.map((attachment) => (
                <article className="rounded-md border border-neutral-800 bg-black/40 p-3" key={attachment.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-50">{attachment.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(attachment.attachmentDate)} · {attachment.uploadedByName}
                      </p>
                    </div>
                    <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-slate-300">
                      {attachment.fileSizeMb} MB
                    </span>
                  </div>
                  {attachment.description ? (
                    <p className="mt-2 text-sm leading-5 text-slate-400">{attachment.description}</p>
                  ) : null}
                  {attachment.url ? (
                    <a
                      className="mt-3 inline-flex text-sm font-medium text-red-300 hover:text-red-200"
                      href={attachment.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("scene.openFile", { fileName: attachment.fileName })}
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{attachment.fileName}</p>
                  )}
                </article>
              ))}
              {attachments.length === 0 ? (
                <p className="text-sm text-slate-400">{t("scene.noAttachments")}</p>
              ) : null}
            </div>
          </div>

          {error ? <p className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
        </aside>
      </section>
    </div>
  );
}
