import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { secondsToTimecode } from "@/lib/timecode";
import { jsonError } from "@/lib/api/http";
import { Comment } from "@/models/Comment";
import { VideoVersion } from "@/models/VideoVersion";
import { commentPriorities } from "@/types/domain";

const createCommentSchema = z.object({
  frame: z.number().int().nonnegative(),
  timeSeconds: z.number().nonnegative(),
  text: z.string().min(1),
  priority: z.enum(commentPriorities).default("medium"),
  assignedTo: z.string().optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoVersionId: string }> }
) {
  try {
    const { videoVersionId } = await params;
    const user = await requireUser();
    await connectDb();

    const video = await VideoVersion.findById(videoVersionId).lean();

    if (!video) {
      return jsonError("Video version not found", 404);
    }

    await assertProjectPermission(user.id, String(video.projectId), "project:read");

    const comments = await Comment.find({ videoVersionId }).sort({ frame: 1 }).lean();

    return NextResponse.json({
      comments: comments.map((comment) => ({
        id: String(comment._id),
        frame: comment.frame,
        timeSeconds: comment.timeSeconds,
        timecode: comment.timecode,
        text: comment.text,
        status: comment.status,
        priority: comment.priority,
        createdBy: String(comment.createdBy),
        assignedTo: comment.assignedTo ? String(comment.assignedTo) : null
      }))
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoVersionId: string }> }
) {
  try {
    const { videoVersionId } = await params;
    const user = await requireUser();
    const body = createCommentSchema.parse(await request.json());
    await connectDb();

    const video = await VideoVersion.findById(videoVersionId).lean();

    if (!video) {
      return jsonError("Video version not found", 404);
    }

    await assertProjectPermission(user.id, String(video.projectId), "comment:create");

    const comment = await Comment.create({
      projectId: video.projectId,
      sceneId: video.sceneId,
      shotId: video.shotId,
      videoVersionId: video._id,
      scriptVersionId: video.scriptVersionId,
      frame: body.frame,
      timeSeconds: body.timeSeconds,
      timecode: secondsToTimecode(body.timeSeconds, video.fps),
      fps: video.fps,
      text: body.text,
      priority: body.priority,
      assignedTo: body.assignedTo ?? undefined,
      createdBy: user.id
    });

    return NextResponse.json(
      {
        comment: {
          id: String(comment._id),
          frame: comment.frame,
          timeSeconds: comment.timeSeconds,
          timecode: comment.timecode,
          text: comment.text,
          status: comment.status,
          priority: comment.priority,
          createdBy: String(comment.createdBy),
          assignedTo: comment.assignedTo ? String(comment.assignedTo) : null
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid comment payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
