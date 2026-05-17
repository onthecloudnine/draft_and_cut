import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SOURCE_DIR = path.resolve(process.env.UPLOAD_ESCENAS_DIR ?? "upload_escenas");
const OUT_DIR = path.resolve(process.env.SHOTS_OUT_DIR ?? "shots_output");
const DETECTOR = (getFlag("--detector") ?? "scdet") as "scdet" | "scene";
const DEFAULT_THRESHOLD = DETECTOR === "scdet" ? 8 : 0.3;
const THRESHOLD = Number(getFlag("--threshold") ?? DEFAULT_THRESHOLD);
const MIN_SHOT_DURATION = Number(getFlag("--min-duration") ?? 0.4);
const SKIP_CLIPS = process.argv.includes("--csv-only");
const ONLY = getFlag("--only");

type Cut = { time: number; score: number };

const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".m4v"]);

function getFlag(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

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
  return Number(stdout.trim());
}

function detectWithScene(filePath: string, threshold: number): Cut[] {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i", filePath,
      "-filter:v", `select='gt(scene,${threshold})',showinfo`,
      "-an",
      "-f", "null",
      "-"
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 200 }
  );
  const stderr = result.stderr ?? "";
  const cuts: Cut[] = [];
  const regex = /pts_time:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(stderr)) !== null) {
    cuts.push({ time: Number(m[1]), score: 0 });
  }
  return cuts;
}

function detectWithScdet(filePath: string, threshold: number): Cut[] {
  const metaFile = path.join(
    tmpdir(),
    `scd_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`
  );
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i", filePath,
      "-vf", `scdet=threshold=${threshold}:sc_pass=1,metadata=mode=print:file=${metaFile}`,
      "-an",
      "-f", "null",
      "-"
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }
  );

  if (result.status !== 0 && !existsSync(metaFile)) {
    throw new Error(`ffmpeg scdet falló:\n${result.stderr}`);
  }

  const content = existsSync(metaFile) ? readFileSync(metaFile, "utf8") : "";
  rmSync(metaFile, { force: true });

  const cuts: Cut[] = [];
  let pendingTime: number | null = null;
  let pendingScore: number | null = null;
  const flush = () => {
    if (pendingTime !== null) cuts.push({ time: pendingTime, score: pendingScore ?? 0 });
    pendingTime = null;
    pendingScore = null;
  };
  for (const line of content.split("\n")) {
    const frameMatch = line.match(/^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/);
    if (frameMatch) {
      flush();
      pendingTime = Number(frameMatch[1]);
      continue;
    }
    const scoreMatch = line.match(/lavfi\.scd\.score=([\d.]+)/);
    if (scoreMatch) pendingScore = Number(scoreMatch[1]);
  }
  flush();
  return cuts;
}

function detectSceneChanges(filePath: string, threshold: number): Cut[] {
  const raw = DETECTOR === "scdet"
    ? detectWithScdet(filePath, threshold)
    : detectWithScene(filePath, threshold);
  return mergeShortCuts(raw, MIN_SHOT_DURATION);
}

function mergeShortCuts(cuts: Cut[], minDuration: number): Cut[] {
  if (minDuration <= 0) return cuts;
  const out: Cut[] = [];
  let lastTime = 0;
  for (const c of cuts) {
    if (c.time - lastTime < minDuration) continue;
    out.push(c);
    lastTime = c.time;
  }
  return out;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  const intSs = Math.floor(ss);
  const ms = Math.round((ss - intSs) * 1000);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(intSs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function safeSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function cutClip(input: string, start: number, end: number, output: string) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    start.toFixed(3),
    "-to",
    end.toFixed(3),
    "-i",
    input,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    output
  ];
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg cut falló para ${output}`);
  }
}

function listVideos(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
    .filter((f) => !ONLY || f.includes(ONLY))
    .map((f) => path.join(dir, f))
    .filter((p) => statSync(p).isFile())
    .sort();
}

type ShotRow = {
  scene: string;
  slug: string;
  shot: number;
  start: number;
  end: number;
  startScore: number;
};

const allShots: ShotRow[] = [];

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function processVideo(videoPath: string) {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const slug = safeSlug(baseName);
  console.log(`\n=== ${baseName} ===`);

  const duration = probeDuration(videoPath);
  console.log(`  duración: ${formatTimecode(duration)} (${duration.toFixed(2)}s)`);

  console.log(`  detectando planos (detector=${DETECTOR}, threshold=${THRESHOLD}, min=${MIN_SHOT_DURATION}s)...`);
  const changes = detectSceneChanges(videoPath, THRESHOLD);
  console.log(`  cambios de plano: ${changes.length}`);

  type Shot = { index: number; start: number; end: number; startScore: number };
  const boundaries: Cut[] = [{ time: 0, score: 0 }, ...changes, { time: duration, score: 0 }];
  const shots: Shot[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i].time;
    const end = boundaries[i + 1].time;
    if (end - start < 0.05) continue;
    shots.push({ index: shots.length + 1, start, end, startScore: boundaries[i].score });
  }

  const csvRows = ["shot,start_seconds,end_seconds,start_tc,end_tc,duration_seconds,detection_score"];
  for (const shot of shots) {
    csvRows.push(
      [
        shot.index,
        shot.start.toFixed(3),
        shot.end.toFixed(3),
        formatTimecode(shot.start),
        formatTimecode(shot.end),
        (shot.end - shot.start).toFixed(3),
        shot.startScore.toFixed(2)
      ].join(",")
    );
    allShots.push({
      scene: baseName,
      slug,
      shot: shot.index,
      start: shot.start,
      end: shot.end,
      startScore: shot.startScore
    });
  }

  const videoOutDir = path.join(OUT_DIR, slug);
  mkdirSync(videoOutDir, { recursive: true });
  const csvPath = path.join(videoOutDir, `${slug}_shots.csv`);
  writeFileSync(csvPath, csvRows.join("\n") + "\n", "utf8");
  console.log(`  CSV: ${csvPath}`);

  if (SKIP_CLIPS) return;

  const clipsDir = path.join(videoOutDir, "clips");
  mkdirSync(clipsDir, { recursive: true });
  console.log(`  cortando ${shots.length} clips...`);
  for (const shot of shots) {
    const padded = String(shot.index).padStart(3, "0");
    const outFile = path.join(clipsDir, `${slug}_shot_${padded}.mp4`);
    if (existsSync(outFile)) {
      console.log(`    [skip] ${path.basename(outFile)}`);
      continue;
    }
    cutClip(videoPath, shot.start, shot.end, outFile);
    console.log(`    ✓ ${path.basename(outFile)} (${(shot.end - shot.start).toFixed(2)}s)`);
  }
}

function writeConsolidatedCsv() {
  if (allShots.length === 0) return;
  const header = "scene,slug,shot,start_seconds,end_seconds,start_tc,end_tc,duration_seconds,detection_score";
  const rows = [header];
  for (const r of allShots) {
    rows.push(
      [
        csvField(r.scene),
        csvField(r.slug),
        String(r.shot),
        r.start.toFixed(3),
        r.end.toFixed(3),
        formatTimecode(r.start),
        formatTimecode(r.end),
        (r.end - r.start).toFixed(3),
        r.startScore.toFixed(2)
      ].join(",")
    );
  }
  const outPath = path.join(OUT_DIR, "all_shots.csv");
  writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
  console.log(`\nCSV consolidado: ${outPath} (${allShots.length} planos)`);
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`No existe el directorio fuente: ${SOURCE_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const videos = listVideos(SOURCE_DIR);
  if (videos.length === 0) {
    console.error(`Sin videos en ${SOURCE_DIR}`);
    process.exit(1);
  }

  console.log(`Procesando ${videos.length} videos`);
  console.log(`  fuente: ${SOURCE_DIR}`);
  console.log(`  salida: ${OUT_DIR}`);
  console.log(`  detector: ${DETECTOR}`);
  console.log(`  threshold: ${THRESHOLD}`);
  console.log(`  min duración por plano: ${MIN_SHOT_DURATION}s`);
  console.log(`  cortar clips: ${SKIP_CLIPS ? "no" : "sí (re-encode preciso)"}`);

  for (const video of videos) {
    try {
      await processVideo(video);
    } catch (err) {
      console.error(`  ERROR en ${video}:`, err);
    }
  }

  writeConsolidatedCsv();

  console.log("\nListo.");
}

main();
