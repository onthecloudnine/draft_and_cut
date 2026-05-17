import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { Scene } from "@/models/Scene";
import { Shot } from "@/models/Shot";
import { ScriptVersion } from "@/models/ScriptVersion";

const CSV_PATH = path.resolve(
  process.env.IMPORT_SHOT_TIMECODES_CSV ?? "shots_output/all_shots.csv"
);
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_SCENE = getFlag("--scene");

type CsvRow = {
  scene: string;
  slug: string;
  shot: string;
  start_seconds: string;
  end_seconds: string;
  start_tc: string;
  end_tc: string;
  duration_seconds: string;
  detection_score: string;
};

type ParsedRow = {
  sceneNumber: string;
  shotIndex: number;
  startFrames: number;
  endFrames: number;
  durationFrames: number;
};

function getFlag(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function parseSceneNumber(text: string): string | null {
  const match = text.match(/Esc[ae]na\s*(\d+)/i);
  return match ? match[1] : null;
}

function compareShotNumbers(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function padShotNumber(sceneNumber: string, index: number, width: number) {
  return `${sceneNumber}.${String(index).padStart(Math.max(2, width), "0")}`;
}

function nextShotNumber(sceneNumber: string, existing: string[]) {
  const used = new Set(existing);
  const sample = existing.find((value) => value.includes("."));
  const width = sample ? (sample.split(".")[1]?.length ?? 2) : 2;
  let index = existing.length + 1;
  for (let i = 0; i < 10_000; i += 1) {
    const candidate = padShotNumber(sceneNumber, index, width);
    if (!used.has(candidate)) return candidate;
    index += 1;
  }
  return `${sceneNumber}.${Date.now()}`;
}

async function resolveProject() {
  const projects = await Project.find({}).lean();
  if (projects.length === 0) throw new Error("No projects in database.");
  const slugFilter = process.env.IMPORT_SHOT_TIMECODES_PROJECT_SLUG;
  const project = slugFilter ? projects.find((p) => p.slug === slugFilter) : projects[0];
  if (!project) throw new Error(`Project not found (slug filter: ${slugFilter}).`);
  if (projects.length > 1 && !slugFilter) {
    console.warn(
      `Multiple projects (${projects.map((p) => p.slug).join(", ")}). Using "${project.slug}". ` +
        `Set IMPORT_SHOT_TIMECODES_PROJECT_SLUG to override.`
    );
  }
  return project;
}

async function resolveScriptVersionId(projectId: unknown) {
  const active = await ScriptVersion.findOne({ projectId, status: "active" }).lean();
  if (active?._id) return active._id;
  const latest = await ScriptVersion.findOne({ projectId }).sort({ versionNumber: -1 }).lean();
  if (latest?._id) return latest._id;
  return null;
}

async function main() {
  await connectDb();

  const project = await resolveProject();
  const fps = Math.max(1, Math.round(project.fpsDefault ?? 24));
  console.log(`Project: ${project.slug} (fps=${fps})`);
  console.log(`CSV: ${CSV_PATH}`);
  if (DRY_RUN) console.log("DRY RUN — no writes");

  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CsvRow[];

  const byScene = new Map<string, ParsedRow[]>();
  let skippedRows = 0;
  for (const row of rows) {
    const sceneNumber = parseSceneNumber(row.scene ?? "") ?? parseSceneNumber(row.slug ?? "");
    if (!sceneNumber) {
      skippedRows += 1;
      continue;
    }
    if (ONLY_SCENE && sceneNumber !== ONLY_SCENE) continue;
    const shotIndex = Number.parseInt(row.shot, 10);
    if (!Number.isFinite(shotIndex) || shotIndex < 1) {
      skippedRows += 1;
      continue;
    }
    const startSeconds = Number.parseFloat(row.start_seconds);
    const endSeconds = Number.parseFloat(row.end_seconds);
    const durationSeconds = Number.parseFloat(row.duration_seconds);
    if (![startSeconds, endSeconds, durationSeconds].every(Number.isFinite)) {
      skippedRows += 1;
      continue;
    }
    const startFrames = Math.max(0, Math.round(startSeconds * fps));
    const endFrames = Math.max(startFrames, Math.round(endSeconds * fps));
    const durationFrames = Math.max(0, Math.round(durationSeconds * fps));
    const list = byScene.get(sceneNumber) ?? [];
    list.push({ sceneNumber, shotIndex, startFrames, endFrames, durationFrames });
    byScene.set(sceneNumber, list);
  }

  if (skippedRows > 0) console.warn(`Skipped ${skippedRows} CSV rows (missing scene/shot/timecode)`);

  let scenesUpdated = 0;
  let shotsUpdated = 0;
  let shotsCreated = 0;
  let scenesMissing = 0;

  const scriptVersionId = await resolveScriptVersionId(project._id);

  for (const [sceneNumber, parsedRows] of Array.from(byScene.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  )) {
    const scene = await Scene.findOne({ projectId: project._id, sceneNumber }).lean();
    if (!scene) {
      console.warn(`  · Scene ${sceneNumber} not found in DB — skipping ${parsedRows.length} rows`);
      scenesMissing += 1;
      continue;
    }

    parsedRows.sort((a, b) => a.shotIndex - b.shotIndex);

    const dbShots = await Shot.find({ sceneId: scene._id }).lean();
    dbShots.sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber));

    const existingNumbers = dbShots.map((shot) => shot.shotNumber);
    const targets: Array<{ shotId?: unknown; cloneFrom?: typeof dbShots[number]; row: ParsedRow }> = [];

    for (let i = 0; i < parsedRows.length; i += 1) {
      const row = parsedRows[i];
      const dbShot = dbShots[i];
      if (dbShot) {
        targets.push({ shotId: dbShot._id, row });
      } else {
        const cloneSource = dbShots[dbShots.length - 1] ?? dbShots[i - 1];
        targets.push({ cloneFrom: cloneSource, row });
      }
    }

    let updatedInScene = 0;
    let createdInScene = 0;

    for (const target of targets) {
      if (target.shotId) {
        if (!DRY_RUN) {
          await Shot.findByIdAndUpdate(target.shotId, {
            startFrame: target.row.startFrames,
            endFrame: target.row.endFrames,
            durationFrames: target.row.durationFrames
          });
        }
        updatedInScene += 1;
      } else {
        const source = target.cloneFrom;
        const versionId = source?.scriptVersionId ?? scriptVersionId;
        if (!versionId) {
          console.warn(`    · No scriptVersionId available for new shot in scene ${sceneNumber}`);
          continue;
        }
        const newNumber = nextShotNumber(sceneNumber, existingNumbers);
        existingNumbers.push(newNumber);
        if (!DRY_RUN) {
          await Shot.create({
            projectId: project._id,
            sceneId: scene._id,
            scriptVersionId: versionId,
            sceneNumber,
            shotNumber: newNumber,
            shotType: source?.shotType ?? "",
            status: source?.status ?? "animatic",
            description: source?.description ?? "",
            action: source?.action ?? "",
            camera: source?.camera ?? "",
            sound: source?.sound ?? "",
            requiredElements: source?.requiredElements ?? [],
            productionNotes: source?.productionNotes ?? "",
            startFrame: target.row.startFrames,
            endFrame: target.row.endFrames,
            durationFrames: target.row.durationFrames
          });
        }
        createdInScene += 1;
      }
    }

    console.log(
      `  · Scene ${sceneNumber}: ${updatedInScene} updated, ${createdInScene} created (CSV=${parsedRows.length}, DB=${dbShots.length})`
    );
    scenesUpdated += 1;
    shotsUpdated += updatedInScene;
    shotsCreated += createdInScene;
  }

  console.log("");
  console.log("Summary");
  console.log(`  scenes processed : ${scenesUpdated}`);
  console.log(`  scenes missing   : ${scenesMissing}`);
  console.log(`  shots updated    : ${shotsUpdated}`);
  console.log(`  shots created    : ${shotsCreated}`);
  if (DRY_RUN) console.log("  (dry run — no writes were made)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
