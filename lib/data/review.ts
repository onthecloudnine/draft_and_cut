import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { VideoVersion } from "@/models/VideoVersion";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { Comment } from "@/models/Comment";

export async function getReviewData(videoVersionId: string) {
  await connectDb();

  const video = await VideoVersion.findById(videoVersionId).lean();

  if (!video) {
    return null;
  }

  const [scene, shot, comments] = await Promise.all([
    Scene.findById(video.sceneId).lean(),
    video.shotId ? Shot.findById(video.shotId).lean() : Promise.resolve(null),
    Comment.find({ videoVersionId }).sort({ frame: 1 }).lean()
  ]);

  const signedVideoUrl = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getUploadBucket(),
      Key: video.s3Key
    }),
    { expiresIn: 60 * 30 }
  );

  return {
    video: {
      id: String(video._id),
      projectId: String(video.projectId),
      sceneId: String(video.sceneId),
      shotId: video.shotId ? String(video.shotId) : null,
      scriptVersionId: video.scriptVersionId ? String(video.scriptVersionId) : null,
      versionNumber: video.versionNumber,
      stage: video.stage,
      status: video.status,
      fileName: video.fileName,
      duration: video.duration,
      fps: video.fps,
      frameCount: video.frameCount,
      resolution: video.resolution,
      url: signedVideoUrl
    },
    scene: scene
      ? {
          id: String(scene._id),
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          description: scene.description,
          location: scene.location,
          timeOfDay: scene.timeOfDay
        }
      : null,
    shot: shot
      ? {
          id: String(shot._id),
          shotNumber: shot.shotNumber,
          shotType: shot.shotType,
          description: shot.description,
          action: shot.action,
          camera: shot.camera,
          sound: shot.sound,
          requiredElements: shot.requiredElements,
          productionNotes: shot.productionNotes,
          startFrame: shot.startFrame,
          endFrame: shot.endFrame
        }
      : null,
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
  };
}
