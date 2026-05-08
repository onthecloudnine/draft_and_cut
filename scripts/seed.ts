import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db/mongoose";
import { Project } from "@/models/Project";
import { User } from "@/models/User";
import { ProjectMembership } from "@/models/ProjectMembership";
import { importTechnicalScriptCsv } from "@/lib/script/import-csv";

async function main() {
  await connectDb();

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "change-me-before-production";
  const name = process.env.SEED_ADMIN_NAME ?? "Administrador";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.findOneAndUpdate(
    { email },
    {
      name,
      email,
      passwordHash,
      accountRole: "admin",
      isActive: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const project = await Project.findOneAndUpdate(
    { slug: "uky-lola" },
    {
      slug: "uky-lola",
      title: "Uky y Lola en Tierra del Fuego",
      description: "Produccion de animacion 3D",
      fpsDefault: 24
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ProjectMembership.findOneAndUpdate(
    { userId: user._id, projectId: project._id },
    { userId: user._id, projectId: project._id, role: "admin" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const csvPath =
    process.env.SEED_SCRIPT_CSV_PATH ??
    path.join(process.cwd(), "guion_tecnico_uky_lola_planos.csv");

  if (!existsSync(csvPath)) {
    throw new Error(`Seed CSV not found at ${csvPath}`);
  }

  const importResult = await importTechnicalScriptCsv({
    csvContent: readFileSync(csvPath, "utf8"),
    projectId: String(project._id),
    createdBy: String(user._id),
    source: "seed_csv",
    publish: true,
    changeSummary: `Carga inicial desde ${path.basename(csvPath)}.`
  });

  console.log("Seed completed");
  console.log(`Admin: ${email}`);
  console.log(`Project: ${project.title}`);
  console.log(
    `Script v${importResult.versionNumber}: ${importResult.sceneCount} scenes, ${importResult.shotCount} shots`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
