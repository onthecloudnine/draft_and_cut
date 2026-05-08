import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { connectDb } from "@/lib/db/mongoose";
import { importLiteraryScript } from "@/lib/script/import-literary-script";
import { Project } from "@/models/Project";

async function main() {
  const scriptPath =
    process.argv[2] ?? "/Users/antonio/Downloads/ Uky & Lola, V-14, Guión Español .txt";
  const projectSlug = process.argv[3] ?? "uky-lola";

  await connectDb();

  const project = await Project.findOne({ slug: projectSlug }).lean();

  if (!project) {
    throw new Error(`Project not found for slug ${projectSlug}`);
  }

  const result = await importLiteraryScript({
    projectId: String(project._id),
    scriptText: readFileSync(path.resolve(scriptPath), "utf8")
  });

  console.log("Literary script import completed");
  console.log(`Project: ${project.title}`);
  console.log(`Parsed scenes: ${result.parsedSceneCount}`);
  console.log(`Updated scenes: ${result.updatedSceneCount}`);

  if (result.missingSceneNumbers.length > 0) {
    console.log(`Missing scene numbers: ${result.missingSceneNumbers.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
