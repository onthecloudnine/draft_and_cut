import "dotenv/config";
import { connectDb } from "@/lib/db/mongoose";
import { ProjectMembership } from "@/models/ProjectMembership";
import { User } from "@/models/User";
import { Project } from "@/models/Project";
import { getProjectsForUser } from "@/lib/data/projects";

async function main() {
  await connectDb();
  const target = await User.findOne({ email: "hola@lafabulosa.org" }).lean();
  if (!target) {
    console.log("USER NOT FOUND");
    process.exit(1);
  }
  console.log("USER:", target._id, target.email, "active=", target.isActive);

  const raw = await ProjectMembership.find({ userId: target._id }).lean();
  console.log("RAW MEMBERSHIPS (by ObjectId):");
  for (const m of raw) {
    console.log("  projectId=", m.projectId, "typeof=", typeof m.projectId, "role=", m.role);
  }

  const projIds = raw.map((m) => m.projectId);
  const projects = await Project.find({ _id: { $in: projIds } }).lean();
  console.log("PROJECTS MATCHED:");
  for (const p of projects) console.log("  ", p._id, p.title);

  console.log("\n--- via getProjectsForUser ---");
  const result = await getProjectsForUser(String(target._id));
  for (const p of result) console.log("  ", p.id, p.title, "role=", p.role);

  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
