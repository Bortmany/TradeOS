// TradeOS — delete one of the signed-in user's saved coaching notes.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import { routeIdSchema } from "@/lib/route-id";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withUser(async (user, _req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("coaching:write", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;
  try {
    const id = routeIdSchema.parse((await params).id);
    const r = await prisma.coachingNote.deleteMany({ where: { id, userId: user.id } });
    if (r.count === 0) return NextResponse.json({ ok: false, error: "Note not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
