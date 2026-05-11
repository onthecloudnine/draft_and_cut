import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertCanManageUsers } from "@/lib/auth/admin";
import { connectDb } from "@/lib/db/mongoose";
import { jsonError } from "@/lib/api/http";
import { ProjectJoinRequest } from "@/models/ProjectJoinRequest";
import { ProjectMembership } from "@/models/ProjectMembership";
import { userRoles } from "@/types/domain";

const reviewJoinRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  role: z.enum(userRoles).optional().default("read_only")
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;
    const user = await requireUser();
    await assertCanManageUsers(user.id);
    const body = reviewJoinRequestSchema.parse(await request.json());
    await connectDb();

    const joinRequest = await ProjectJoinRequest.findById(requestId);

    if (!joinRequest || joinRequest.status !== "pending") {
      return jsonError("Join request not found", 404);
    }

    if (body.action === "approve") {
      await ProjectMembership.findOneAndUpdate(
        { projectId: joinRequest.projectId, userId: joinRequest.userId },
        {
          projectId: joinRequest.projectId,
          userId: joinRequest.userId,
          role: body.role
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      joinRequest.status = "approved";
    } else {
      joinRequest.status = "rejected";
    }

    joinRequest.reviewedBy = new Types.ObjectId(user.id);
    joinRequest.reviewedAt = new Date();
    await joinRequest.save();

    return NextResponse.json({ ok: true, status: joinRequest.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid join request review payload", 400);
    }

    return jsonError(error instanceof Error ? error.message : "Unexpected error", 400);
  }
}
