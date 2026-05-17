import "dotenv/config";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PutObjectCommand, type ObjectCannedACL } from "@aws-sdk/client-s3";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { buildVideoS3Key } from "@/lib/s3/keys";
import { getUploadAcl } from "@/lib/s3/upload";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { User } from "@/models/User";
import { VideoVersion } from "@/models/VideoVersion";

const STAGE = (process.env.UPLOAD_ESCENAS_STAGE ?? "animation") as
  | "animatic"
  | "layout"
  | "blocking"
  | "animation"
  | "lighting"
  | "render"
  | "final";
const SCOPE = "scene" as const;
const SOURCE_DIR = path.resolve(process.env.UPLOAD_ESCENAS_DIR ?? "upload_escenas");
const SKIP_EXISTING = process.argv.includes("--skip-existing");

function parseSceneNumber(filename: string): string | null {
  const match = filename.match(/Esc[ae]na\s*(\d+)/i);
  return match ? match[1] : null;
}

function probeVideo(filePath: string) {
  const stdout = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate,duration:format=duration",
      "-of",
      "json",
      filePath
    ],
    { encoding: "utf8" }
  );
  const json = JSON.parse(stdout) as {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  const stream = json.streams?.[0];
  if (!stream || !stream.width || !stream.height) {
    throw new Error("ffprobe: missing video stream metadata");
  }
  const [num, den] = (stream.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den ? num / den : 24;
  const duration = Number(stream.duration ?? json.format?.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("ffprobe: invalid duration");
  }
  return {
    width: stream.width,
    height: stream.height,
    fps: Number(fps.toFixed(3)),
    duration: Number(duration.toFixed(3))
  };
}

async function main() {
  await connectDb();

  const projects = await Project.find({}).lean();
  if (projects.length === 0) {
    throw new Error("No projects in database.");
  }
  const slugFilter = process.env.UPLOAD_ESCENAS_PROJECT_SLUG;
  const project = slugFilter
    ? projects.find((item) => item.slug === slugFilter)
    : projects[0];
  if (!project) {
    throw new Error(`Project not found (slug filter: ${slugFilter}).`);
  }
  if (projects.length > 1 && !slugFilter) {
    console.warn(
      `Multiple projects (${projects.map((p) => p.slug).join(", ")}). Using "${project.slug}". ` +
        `Set UPLOAD_ESCENAS_PROJECT_SLUG to override.`
    );
  }

  const admin = await User.findOne({ accountRole: "admin" }).lean();
  if (!admin) {
    throw new Error("No admin user found to attribute the uploads.");
  }

  const entries = await readdir(SOURCE_DIR);
  const files = entries
    .filter((entry) => entry.toLowerCase().endsWith(".mp4"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  if (files.length === 0) {
    console.log(`No .mp4 files in ${SOURCE_DIR}`);
    return;
  }

  console.log(
    `Project: ${project.title} (${project.slug}) · ${files.length} files · stage=${STAGE}`
  );

  const s3 = getS3Client();
  const bucket = getUploadBucket();
  const acl = getUploadAcl();

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    const sceneNumber = parseSceneNumber(filename);
    if (!sceneNumber) {
      console.warn(`SKIP no scene number: ${filename}`);
      skipped += 1;
      continue;
    }
    const scene = await Scene.findOne({ projectId: project._id, sceneNumber });
    if (!scene) {
      console.warn(`SKIP scene ${sceneNumber} not found: ${filename}`);
      skipped += 1;
      continue;
    }

    const filePath = path.join(SOURCE_DIR, filename);
    try {
      const fileStats = await stat(filePath);
      const probed = probeVideo(filePath);

      const latest = await VideoVersion.findOne({
        projectId: project._id,
        sceneId: scene._id,
        shotId: null,
        scope: SCOPE,
        stage: STAGE
      })
        .sort({ versionNumber: -1 })
        .lean();
      if (latest && SKIP_EXISTING) {
        console.log(`SKIP Escena ${sceneNumber} already has v${latest.versionNumber}`);
        skipped += 1;
        continue;
      }
      const versionNumber = (latest?.versionNumber ?? 0) + 1;

      const s3Key = buildVideoS3Key({
        projectSlug: project.slug,
        sceneNumber: scene.sceneNumber,
        scope: SCOPE,
        stage: STAGE,
        versionNumber
      });

      const body = await readFile(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: body,
          ContentType: "video/mp4",
          ...(acl ? { ACL: acl as ObjectCannedACL } : {})
        })
      );

      const frameCount = Math.round(probed.duration * probed.fps);
      const uploadId = randomUUID();
      const created = await VideoVersion.create({
        projectId: project._id,
        sceneId: scene._id,
        scope: SCOPE,
        versionNumber,
        stage: STAGE,
        status: "ready_for_review",
        source: "bulk_import",
        fileName: filename,
        s3Key,
        mimeType: "video/mp4",
        duration: probed.duration,
        fps: probed.fps,
        frameCount,
        resolution: `${probed.width}x${probed.height}`,
        fileSizeMb: Number((fileStats.size / 1024 / 1024).toFixed(2)),
        uploadedBy: admin._id,
        notes: "",
        uploadId
      });

      scene.currentVideoVersionId = created._id;
      await scene.save();

      console.log(
        `OK  Escena ${sceneNumber} v${versionNumber} (${probed.width}x${probed.height} @ ${probed.fps}fps, ${probed.duration}s)`
      );
      succeeded += 1;
    } catch (error) {
      console.error(
        `FAIL ${filename}:`,
        error instanceof Error ? error.message : error
      );
      failed += 1;
    }
  }

  console.log(`\nDone. ok=${succeeded} skip=${skipped} fail=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
