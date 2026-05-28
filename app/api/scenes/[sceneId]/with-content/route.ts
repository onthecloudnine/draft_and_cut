import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { VideoVersion } from "@/models/VideoVersion";
import { SceneAttachment } from "@/models/SceneAttachment";
import { SceneAssetTag } from "@/models/SceneAssetTag";
import { SceneResourceAssignment } from "@/models/SceneResourceAssignment";
import { Comment } from "@/models/Comment";
import { CommentReply } from "@/models/CommentReply";

const bodySchema = z.object({ confirmation: z.string() });
const CONFIRMATION_PHRASE = "acepto borrar";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  if (!sceneId || !/^[a-f0-9]{24}$/i.test(sceneId)) {
    return jsonError("Invalid scene id", 400);
  }

  let body: { confirmation: string };
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid body", 400);
  }
  if (body.confirmation.trim().toLowerCase() !== CONFIRMATION_PHRASE) {
    return jsonError("Confirmation phrase mismatch", 400);
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unauthorized", 401);
  }

  await connectDb();
  const scene = await Scene.findById(sceneId).lean();
  if (!scene) return jsonError("Scene not found", 404);

  try {
    await assertProjectPermission(user.id, String(scene.projectId), "project:manage");
  } catch {
    return jsonError("Forbidden", 403);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };
      const s3 = getS3Client();
      const bucket = getUploadBucket();

      try {
        send({ phase: "scanning", progress: 3, label: "Analizando contenido relacionado..." });

        const [videos, attachments] = await Promise.all([
          VideoVersion.find({ sceneId }).select("_id s3Key thumbnailKey").lean(),
          SceneAttachment.find({ sceneId }).select("_id s3Key").lean()
        ]);
        const videoIds = videos.map((video) => video._id);
        const comments = await Comment.find({ videoVersionId: { $in: videoIds } })
          .select("_id")
          .lean();
        const commentIds = comments.map((comment) => comment._id);

        const s3Keys = [
          ...videos.map((video) => video.s3Key).filter((value): value is string => Boolean(value)),
          ...videos
            .map((video) => video.thumbnailKey)
            .filter((value): value is string => Boolean(value)),
          ...attachments
            .map((attachment) => attachment.s3Key)
            .filter((value): value is string => Boolean(value))
        ];

        send({
          phase: "scanning",
          progress: 8,
          label: `Encontrado: ${videos.length} videos, ${attachments.length} adjuntos, ${comments.length} comentarios.`
        });

        if (s3Keys.length > 0) {
          const batchSize = 1000;
          let deleted = 0;
          for (let i = 0; i < s3Keys.length; i += batchSize) {
            const batch = s3Keys.slice(i, i + batchSize);
            await s3
              .send(
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true }
                })
              )
              .catch(() => null);
            deleted += batch.length;
            const pct = 10 + (deleted / s3Keys.length) * 30;
            send({
              phase: "s3",
              progress: Math.round(pct),
              label: `Borrando archivos en S3 (${deleted}/${s3Keys.length})...`
            });
          }
        } else {
          send({ phase: "s3", progress: 40, label: "Sin archivos en S3." });
        }

        send({ phase: "db", progress: 45, label: "Borrando respuestas a comentarios..." });
        await CommentReply.deleteMany({ commentId: { $in: commentIds } });

        send({ phase: "db", progress: 55, label: "Borrando comentarios..." });
        await Comment.deleteMany({ _id: { $in: commentIds } });

        send({ phase: "db", progress: 65, label: "Borrando videos..." });
        await VideoVersion.deleteMany({ sceneId });

        send({ phase: "db", progress: 75, label: "Borrando adjuntos..." });
        await SceneAttachment.deleteMany({ sceneId });

        send({ phase: "db", progress: 82, label: "Borrando planos..." });
        await Shot.deleteMany({ sceneId });

        send({ phase: "db", progress: 88, label: "Borrando tags y recursos asignados..." });
        await Promise.all([
          SceneAssetTag.deleteMany({ sceneId }),
          SceneResourceAssignment.deleteMany({ sceneId })
        ]);

        send({ phase: "db", progress: 95, label: "Borrando la escena..." });
        await Scene.deleteOne({ _id: sceneId });

        send({ phase: "done", progress: 100, label: "Escena eliminada." });
      } catch (error) {
        send({
          phase: "error",
          progress: 100,
          error: error instanceof Error ? error.message : "Unexpected error"
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no"
    }
  });
}
