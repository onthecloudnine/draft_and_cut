import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db/mongoose";
import { getProjectsForUser } from "@/lib/data/projects";
import { jsonError } from "@/lib/api/http";
import { Comment } from "@/models/Comment";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { VideoVersion } from "@/models/VideoVersion";

function compareNumericText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export async function GET() {
  try {
    const user = await requireUser();
    await connectDb();

    const projects = await getProjectsForUser(user.id);
    const projectIds = projects.map((project) => project.id);
    const scenes = await Scene.find({ projectId: { $in: projectIds } })
      .sort({ projectId: 1, sortOrder: 1, sceneNumber: 1 })
      .lean();
    scenes.sort((left, right) => {
      const projectDelta = String(left.projectId).localeCompare(String(right.projectId));
      const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      return projectDelta || sortDelta || compareNumericText(left.sceneNumber, right.sceneNumber);
    });

    const [shotCounts, videoCounts, openCommentCounts] = await Promise.all([
      Shot.aggregate<{ _id: unknown; count: number }>([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$sceneId", count: { $sum: 1 } } }
      ]),
      VideoVersion.aggregate<{ _id: unknown; count: number }>([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$sceneId", count: { $sum: 1 } } }
      ]),
      Comment.aggregate<{ _id: unknown; count: number }>([
        { $match: { projectId: { $in: projectIds }, status: { $in: ["open", "in_progress", "needs_review"] } } },
        { $group: { _id: "$sceneId", count: { $sum: 1 } } }
      ])
    ]);

    const shotCountBySceneId = new Map(shotCounts.map((row) => [String(row._id), row.count]));
    const videoCountBySceneId = new Map(videoCounts.map((row) => [String(row._id), row.count]));
    const openCommentCountBySceneId = new Map(openCommentCounts.map((row) => [String(row._id), row.count]));
    const scenesByProjectId = new Map<string, typeof scenes>();

    for (const scene of scenes) {
      const key = String(scene.projectId);
      scenesByProjectId.set(key, [...(scenesByProjectId.get(key) ?? []), scene]);
    }

    return NextResponse.json({
      projects: projects.map((project) => {
        const projectScenes = scenesByProjectId.get(project.id) ?? [];

        return {
          id: project.id,
          slug: project.slug,
          title: project.title,
          description: project.description,
          fpsDefault: project.fpsDefault,
          role: project.role,
          sceneCount: projectScenes.length,
          scenes: projectScenes.map((scene) => {
            const sceneId = String(scene._id);

            return {
              id: sceneId,
              sceneNumber: scene.sceneNumber,
              title: scene.title,
              description: scene.description,
              location: scene.location,
              timeOfDay: scene.timeOfDay,
              status: scene.status,
              shotCount: shotCountBySceneId.get(sceneId) ?? 0,
              videoCount: videoCountBySceneId.get(sceneId) ?? 0,
              openCommentCount: openCommentCountBySceneId.get(sceneId) ?? 0,
              updatedAt: scene.updatedAt?.toISOString() ?? null
            };
          })
        };
      })
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 401);
  }
}

