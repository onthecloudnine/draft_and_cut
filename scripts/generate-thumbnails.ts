import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { GetObjectCommand, PutObjectCommand, type ObjectCannedACL } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { deriveThumbnailKeyFromVideoKey } from "@/lib/s3/keys";
import { getUploadAcl } from "@/lib/s3/upload";
import { VideoVersion } from "@/models/VideoVersion";

const LOCAL_DIR = path.resolve(process.env.UPLOAD_ESCENAS_DIR ?? "upload_escenas");
const FORCE = process.argv.includes("--force");

function probeDuration(filePath: string): number {
  const stdout = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nokey=1:noprint_wrappers=1",
      filePath
    ],
    { encoding: "utf8" }
  );
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("ffprobe: invalid duration");
  }
  return duration;
}

function pickSeekCandidates(duration: number): number[] {
  const base = Math.min(Math.max(duration - 0.2, 0.1), Math.max(3.0, duration * 0.33));
  const last = Math.max(duration - 0.2, 0.1);
  const candidates = [base, duration * 0.5, duration * 0.66, duration * 0.8, last];
  const dedup: number[] = [];
  for (const value of candidates) {
    const clamped = Math.min(last, Math.max(0.1, value));
    if (!dedup.some((existing) => Math.abs(existing - clamped) < 0.25)) {
      dedup.push(clamped);
    }
  }
  return dedup;
}

const DARK_LUMA_THRESHOLD = 25;

function extractFrame(sourcePath: string, outPath: string, seekSeconds: number) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      seekSeconds.toFixed(3),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(640,iw)':-2",
      "-q:v",
      "3",
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

function measureFrameLuma(framePath: string): number {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "info",
      "-i",
      framePath,
      "-vf",
      "signalstats,metadata=print",
      "-f",
      "null",
      "-"
    ],
    { encoding: "utf8" }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = output.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function extractBrightFrame(sourcePath: string, outPath: string, duration: number) {
  const candidates = pickSeekCandidates(duration);
  let bestSeek = candidates[0];
  let bestLuma = -1;
  for (const seek of candidates) {
    extractFrame(sourcePath, outPath, seek);
    const luma = measureFrameLuma(outPath);
    if (luma >= DARK_LUMA_THRESHOLD) {
      return { seek, luma };
    }
    if (luma > bestLuma) {
      bestLuma = luma;
      bestSeek = seek;
    }
  }
  extractFrame(sourcePath, outPath, bestSeek);
  return { seek: bestSeek, luma: bestLuma };
}

async function downloadFromS3(s3Key: string, destPath: string) {
  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: getUploadBucket(), Key: s3Key }),
    { expiresIn: 60 * 30 }
  );
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`S3 download failed (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await (await import("node:fs/promises")).writeFile(destPath, buffer);
}

async function main() {
  await connectDb();

  const filter: Record<string, unknown> = FORCE
    ? {}
    : { $or: [{ thumbnailKey: null }, { thumbnailKey: { $exists: false } }] };
  const videos = await VideoVersion.find(filter).lean();
  console.log(`Videos to process: ${videos.length}${FORCE ? " (force mode)" : ""}`);
  if (videos.length === 0) return;

  const s3 = getS3Client();
  const bucket = getUploadBucket();
  const acl = getUploadAcl();
  const workDir = await mkdtemp(path.join(tmpdir(), "dnc-thumbs-"));

  let succeeded = 0;
  let failed = 0;

  try {
    for (const video of videos) {
      const localCandidate = path.join(LOCAL_DIR, video.fileName);
      const tmpVideo = path.join(workDir, `${String(video._id)}.mp4`);
      const tmpFrame = path.join(workDir, `${String(video._id)}.jpg`);
      let videoSource = "";

      try {
        if (existsSync(localCandidate)) {
          videoSource = `local:${video.fileName}`;
        } else {
          await downloadFromS3(video.s3Key, tmpVideo);
          videoSource = `s3:${video.s3Key}`;
        }
        const sourcePath = videoSource.startsWith("local:") ? localCandidate : tmpVideo;

        const duration = probeDuration(sourcePath);
        const { seek, luma } = extractBrightFrame(sourcePath, tmpFrame, duration);

        const body = await readFile(tmpFrame);
        const thumbnailKey = video.thumbnailKey || deriveThumbnailKeyFromVideoKey(video.s3Key);
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: thumbnailKey,
            Body: body,
            ContentType: "image/jpeg",
            ...(acl ? { ACL: acl as ObjectCannedACL } : {})
          })
        );

        await VideoVersion.updateOne({ _id: video._id }, { $set: { thumbnailKey } });

        console.log(
          `OK  ${video.fileName} (${videoSource}, seek=${seek.toFixed(2)}s, luma=${luma.toFixed(1)})`
        );
        succeeded += 1;
      } catch (error) {
        console.error(
          `FAIL ${video.fileName} (${videoSource || "no source"}):`,
          error instanceof Error ? error.message : error
        );
        failed += 1;
      } finally {
        await rm(tmpVideo, { force: true });
        await rm(tmpFrame, { force: true });
      }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log(`\nDone. ok=${succeeded} fail=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
