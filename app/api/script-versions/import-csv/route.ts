import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { importTechnicalScriptCsv } from "@/lib/script/import-csv";

const importCsvSchema = z.object({
  projectId: z.string().min(1),
  csvContent: z.string().min(1),
  changeSummary: z.string().optional(),
  publish: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = importCsvSchema.parse(await request.json());
    await assertProjectPermission(user.id, body.projectId, "script:manage");
    await connectDb();

    const result = await importTechnicalScriptCsv({
      csvContent: body.csvContent,
      projectId: body.projectId,
      createdBy: user.id,
      changeSummary: body.changeSummary,
      source: "csv_import",
      publish: body.publish
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid CSV import payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
