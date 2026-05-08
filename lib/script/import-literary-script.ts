import { Scene } from "@/models/Scene";

export type LiterarySceneBlock = {
  sceneNumber: string;
  heading: string;
  text: string;
};

type ImportLiteraryScriptInput = {
  projectId: string;
  scriptText: string;
};

export type ImportLiteraryScriptResult = {
  parsedSceneCount: number;
  updatedSceneCount: number;
  missingSceneNumbers: string[];
};

const sceneHeadingPattern = /^\s*(\d{1,3})\s+([A-ZÁÉÍÓÚÑÜ0-9 .,/()'’\-]+)\s*$/u;

function normalizeText(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isSceneHeading(line: string) {
  const match = line.match(sceneHeadingPattern);

  if (!match) {
    return null;
  }

  const heading = match[2]?.trim() ?? "";

  if (heading.length < 4) {
    return null;
  }

  return {
    sceneNumber: String(Number(match[1])),
    heading
  };
}

export function parseLiteraryScript(scriptText: string): LiterarySceneBlock[] {
  const lines = normalizeText(scriptText).split("\n");
  const headings: Array<{ lineIndex: number; sceneNumber: string; heading: string }> = [];

  lines.forEach((line, lineIndex) => {
    const heading = isSceneHeading(line);

    if (heading) {
      headings.push({ lineIndex, ...heading });
    }
  });

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const blockLines = lines.slice(heading.lineIndex + 1, nextHeading?.lineIndex ?? lines.length);

    return {
      sceneNumber: heading.sceneNumber,
      heading: heading.heading,
      text: blockLines.join("\n").trim()
    };
  });
}

export async function importLiteraryScript(input: ImportLiteraryScriptInput): Promise<ImportLiteraryScriptResult> {
  const blocks = parseLiteraryScript(input.scriptText);
  const missingSceneNumbers: string[] = [];
  let updatedSceneCount = 0;

  for (const block of blocks) {
    const result = await Scene.updateOne(
      { projectId: input.projectId, sceneNumber: block.sceneNumber },
      {
        literaryHeading: block.heading,
        literaryScript: block.text
      }
    );

    if (result.matchedCount === 0) {
      missingSceneNumbers.push(block.sceneNumber);
    } else {
      updatedSceneCount += result.matchedCount;
    }
  }

  return {
    parsedSceneCount: blocks.length,
    updatedSceneCount,
    missingSceneNumbers
  };
}
