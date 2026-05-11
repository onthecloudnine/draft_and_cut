"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { commentPriorities, commentStatuses, type CommentPriority, type CommentStatus } from "@/types/domain";
import { secondsToFrame, secondsToTimecode } from "@/lib/timecode";

type ReviewComment = {
  id: string;
  frame: number;
  timeSeconds: number;
  timecode: string;
  text: string;
  status: CommentStatus;
  priority: CommentPriority;
  createdBy: string;
  assignedTo: string | null;
};

type ReviewData = {
  video: {
    id: string;
    sceneId: string;
    shotId: string | null;
    scriptVersionId: string | null;
    versionNumber: number;
    stage: string;
    status: string;
    fileName: string;
    duration: number;
    fps: number;
    frameCount: number;
    resolution: string;
    url: string;
  };
  scene: {
    sceneNumber: string;
    title: string;
    description: string;
    location: string;
    timeOfDay: string;
  } | null;
  shot: {
    shotNumber: string;
    shotType: string;
    description: string;
    action: string;
    camera: string;
    sound: string;
    requiredElements: string[];
    productionNotes: string;
    startFrame?: number | null;
    endFrame?: number | null;
  } | null;
  comments: ReviewComment[];
};

export function ReviewWorkspace({ data }: { data: ReviewData }) {
  const { optionLabel, t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [priority, setPriority] = useState<CommentPriority>("medium");
  const [statusFilter, setStatusFilter] = useState<CommentStatus | "all">("all");
  const [comments, setComments] = useState(data.comments);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentFrame = secondsToFrame(currentTime, data.video.fps);
  const currentTimecode = secondsToTimecode(currentTime, data.video.fps);

  const filteredComments = useMemo(
    () => comments.filter((comment) => statusFilter === "all" || comment.status === statusFilter),
    [comments, statusFilter]
  );

  function stepFrame(direction: -1 | 1) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    const nextFrame = Math.max(0, Math.min(data.video.frameCount, currentFrame + direction));
    video.currentTime = nextFrame / data.video.fps;
    setCurrentTime(video.currentTime);
  }

  async function createComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!commentText.trim()) {
      setError(t("review.commentRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/videos/${data.video.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame: currentFrame,
          timeSeconds: currentTime,
          text: commentText,
          priority
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? t("review.createError"));
      }

      const payload = await response.json();
      setComments((current) => [...current, payload.comment].sort((a, b) => a.frame - b.frame));
      setCommentText("");
      setPriority("medium");
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : t("review.unexpectedError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateCommentStatus(commentId: string, nextStatus: CommentStatus) {
    const response = await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });

    if (response.ok) {
      setComments((current) =>
        current.map((comment) => (comment.id === commentId ? { ...comment, status: nextStatus } : comment))
      );
    }
  }

  return (
    <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="grid gap-4">
        <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black shadow-lg shadow-black/30">
          <video
            className="aspect-video w-full"
            controls
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            ref={videoRef}
            src={data.video.url}
          />
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/30">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-neutral-800"
              onClick={() => stepFrame(-1)}
              type="button"
            >
              {t("review.frameBack")}
            </button>
            <button
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-neutral-800"
              onClick={() => stepFrame(1)}
              type="button"
            >
              {t("review.frameForward")}
            </button>
            <div className="ml-auto grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-500">{t("review.time")}</p>
                <p className="font-medium text-slate-100">{currentTime.toFixed(3)}s</p>
              </div>
              <div>
                <p className="text-slate-500">Frame</p>
                <p className="font-medium text-slate-100">{currentFrame}</p>
              </div>
              <div>
                <p className="text-slate-500">Timecode</p>
                <p className="font-medium text-slate-100">{currentTimecode}</p>
              </div>
            </div>
          </div>

          <div className="relative mt-5 h-7 rounded-full bg-black">
            <div
              className="absolute left-0 top-0 h-7 rounded-full bg-red-900/30"
              style={{ width: `${Math.min(100, (currentFrame / data.video.frameCount) * 100)}%` }}
            />
            {comments.map((comment) => (
              <button
                className="absolute top-1 h-5 w-2 -translate-x-1 rounded-full bg-red-600"
                key={comment.id}
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = comment.timeSeconds;
                  }
                }}
                style={{ left: `${(comment.frame / data.video.frameCount) * 100}%` }}
                title={`${comment.timecode}: ${comment.text}`}
                type="button"
              />
            ))}
          </div>
        </div>

        <form className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/30" onSubmit={createComment}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-50">{t("review.commentFrame", { frame: currentFrame })}</h2>
            <select
              className="h-9 rounded-md border border-neutral-700 bg-black px-2 text-sm text-slate-100"
              onChange={(event) => setPriority(event.target.value as CommentPriority)}
              value={priority}
            >
              {commentPriorities.map((item) => (
                <option key={item} value={item}>
                  {optionLabel("commentPriorities", item)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="min-h-24 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-slate-100"
            onChange={(event) => setCommentText(event.target.value)}
            placeholder={t("review.commentPlaceholder")}
            value={commentText}
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="flex justify-end">
            <button
              className="h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? t("review.saving") : t("review.saveComment")}
            </button>
          </div>
        </form>
      </section>

      <aside className="grid gap-4">
        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/30">
          <h2 className="font-semibold text-slate-50">{t("review.technicalScript")}</h2>
          {data.shot ? (
            <div className="mt-4 grid gap-3 text-sm">
              <p className="font-medium text-slate-50">
                Shot {data.shot.shotNumber} {data.shot.shotType ? `- ${data.shot.shotType}` : ""}
              </p>
              <p className="leading-6 text-slate-400">{data.shot.description}</p>
              <dl className="grid gap-3">
                <div>
                  <dt className="text-slate-500">{t("scene.action")}</dt>
                  <dd className="text-slate-100">{data.shot.action || "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("scene.camera")}</dt>
                  <dd className="text-slate-100">{data.shot.camera || "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("scene.sound")}</dt>
                  <dd className="text-slate-100">{data.shot.sound || "-"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">{t("review.completeSceneVersion")}</p>
          )}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-50">{t("review.comments")}</h2>
            <select
              className="h-9 rounded-md border border-neutral-700 bg-black px-2 text-sm text-slate-100"
              onChange={(event) => setStatusFilter(event.target.value as CommentStatus | "all")}
              value={statusFilter}
            >
              <option value="all">{t("review.all")}</option>
              {commentStatuses.map((item) => (
                <option key={item} value={item}>
                  {optionLabel("commentStatuses", item)}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 grid gap-3">
            {filteredComments.map((comment) => (
              <article className="rounded-md border border-neutral-800 bg-black/40 p-3 text-sm" key={comment.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-50">
                      {t("review.frame")} {comment.frame} / {comment.timecode}
                    </p>
                    <p className="mt-2 leading-6 text-slate-400">{comment.text}</p>
                  </div>
                  <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-slate-300">
                    {optionLabel("commentPriorities", comment.priority)}
                  </span>
                </div>
                <select
                  className="mt-3 h-9 w-full rounded-md border border-neutral-700 bg-black px-2 text-sm text-slate-100"
                  onChange={(event) => void updateCommentStatus(comment.id, event.target.value as CommentStatus)}
                  value={comment.status}
                >
                  {commentStatuses.map((item) => (
                    <option key={item} value={item}>
                      {optionLabel("commentStatuses", item)}
                    </option>
                  ))}
                </select>
              </article>
            ))}
            {filteredComments.length === 0 ? (
              <p className="text-sm text-slate-400">{t("review.emptyComments")}</p>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
