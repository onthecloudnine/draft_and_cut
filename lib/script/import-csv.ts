import { parse } from "csv-parse/sync";
import { Scene } from "@/models/Scene";
import { ScriptVersion } from "@/models/ScriptVersion";
import { Shot } from "@/models/Shot";

export type TechnicalScriptCsvRow = {
  escena_numero: string;
  escena_locacion: string;
  momento: string;
  intencion_dramatica: string;
  ritmo: string;
  plano_numero: string;
  tipo_plano: string;
  descripcion_plano: string;
  accion_principal: string;
  camara_movimiento: string;
  sonido_transicion: string;
  elementos_necesarios: string;
  notas_produccion: string;
};

type ImportTechnicalScriptInput = {
  csvContent: string;
  projectId: string;
  createdBy: string;
  changeSummary?: string;
  source?: string;
  publish?: boolean;
};

export type ImportTechnicalScriptResult = {
  scriptVersionId: string;
  versionNumber: number;
  sceneCount: number;
  shotCount: number;
};

const expectedColumns = [
  "escena_numero",
  "escena_locacion",
  "momento",
  "intencion_dramatica",
  "ritmo",
  "plano_numero",
  "tipo_plano",
  "descripcion_plano",
  "accion_principal",
  "camara_movimiento",
  "sonido_transicion",
  "elementos_necesarios",
  "notas_produccion"
];

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSceneNumber(value: string) {
  return cleanText(value);
}

function normalizeShotNumber(value: string) {
  return cleanText(value);
}

function splitElements(value: string) {
  return cleanText(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSceneTitle(row: TechnicalScriptCsvRow) {
  const location = cleanText(row.escena_locacion);
  const moment = cleanText(row.momento);

  if (location && moment) {
    return `${location} - ${moment}`;
  }

  return location || `Escena ${row.escena_numero}`;
}

function parseRows(csvContent: string): TechnicalScriptCsvRow[] {
  const rows = parse(csvContent, {
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true
  }) as TechnicalScriptCsvRow[];

  if (rows.length === 0) {
    throw new Error("CSV has no rows");
  }

  const columns = Object.keys(rows[0] ?? {});
  const missingColumns = expectedColumns.filter((column) => !columns.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`CSV missing required columns: ${missingColumns.join(", ")}`);
  }

  return rows;
}

export async function importTechnicalScriptCsv(input: ImportTechnicalScriptInput) {
  const rows = parseRows(input.csvContent);

  const latestVersion = await ScriptVersion.findOne({ projectId: input.projectId })
    .sort({ versionNumber: -1 })
    .lean();
  const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  if (input.publish) {
    await ScriptVersion.updateMany(
      { projectId: input.projectId, status: "active" },
      { status: "superseded" }
    );
  }

  const scriptVersion = await ScriptVersion.create({
    projectId: input.projectId,
    versionNumber,
    status: input.publish ? "active" : "draft",
    source: input.source ?? "csv_import",
    changeSummary: input.changeSummary ?? "Importacion de guion tecnico CSV.",
    createdBy: input.createdBy
  });

  const sceneNumbers = Array.from(new Set(rows.map((row) => normalizeSceneNumber(row.escena_numero))));
  const sceneByNumber = new Map<string, string>();

  for (const [index, sceneNumber] of sceneNumbers.entries()) {
    const firstRow = rows.find((row) => normalizeSceneNumber(row.escena_numero) === sceneNumber);

    if (!firstRow) {
      continue;
    }

    const scene = await Scene.findOneAndUpdate(
      { projectId: input.projectId, sceneNumber },
      {
        projectId: input.projectId,
        sceneNumber,
        title: buildSceneTitle(firstRow),
        description: cleanText(firstRow.intencion_dramatica),
        location: cleanText(firstRow.escena_locacion),
        timeOfDay: cleanText(firstRow.momento),
        sortOrder: index,
        status: "in_review",
        currentScriptVersionId: scriptVersion._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    sceneByNumber.set(sceneNumber, String(scene._id));
  }

  await Shot.deleteMany({ projectId: input.projectId, scriptVersionId: scriptVersion._id });

  const shots = rows.map((row) => {
    const sceneNumber = normalizeSceneNumber(row.escena_numero);
    const sceneId = sceneByNumber.get(sceneNumber);

    if (!sceneId) {
      throw new Error(`Scene not found for row ${sceneNumber}/${row.plano_numero}`);
    }

    return {
      projectId: input.projectId,
      sceneId,
      scriptVersionId: scriptVersion._id,
      sceneNumber,
      shotNumber: normalizeShotNumber(row.plano_numero),
      shotType: cleanText(row.tipo_plano),
      description: cleanText(row.descripcion_plano),
      action: cleanText(row.accion_principal),
      camera: cleanText(row.camara_movimiento),
      sound: cleanText(row.sonido_transicion),
      requiredElements: splitElements(row.elementos_necesarios),
      productionNotes: [cleanText(row.notas_produccion), cleanText(row.ritmo)]
        .filter(Boolean)
        .join("\n\n")
    };
  });

  if (shots.length > 0) {
    await Shot.insertMany(shots, { ordered: false });
  }

  return {
    scriptVersionId: String(scriptVersion._id),
    versionNumber,
    sceneCount: sceneNumbers.length,
    shotCount: shots.length
  } satisfies ImportTechnicalScriptResult;
}
