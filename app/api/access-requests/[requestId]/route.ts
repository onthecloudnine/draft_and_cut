import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { AccessRequest } from "@/models/AccessRequest";
import { User } from "@/models/User";

const patchSchema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const currentUser = await requireUser();
    await assertCanManageUsers(currentUser.id);
    const { requestId } = await params;
    const body = patchSchema.parse(await request.json());
    await connectDb();

    const accessRequest = await AccessRequest.findById(requestId);
    if (!accessRequest) return jsonError("Solicitud no encontrada", 404);

    if (body.action === "approve") {
      // Crea/activa el usuario (sin contraseña: entra por Discord).
      await User.findOneAndUpdate(
        { email: accessRequest.email },
        {
          $set: { isActive: true },
          $setOnInsert: {
            email: accessRequest.email,
            name: accessRequest.name || accessRequest.email,
            accountRole: "user"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    accessRequest.status = body.action === "approve" ? "approved" : "rejected";
    accessRequest.reviewedBy = currentUser.id as unknown as typeof accessRequest.reviewedBy;
    accessRequest.reviewedAt = new Date();
    await accessRequest.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Payload inválido", 400);
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
