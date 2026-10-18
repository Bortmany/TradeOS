// TradeOS — thumbs up / down on one of the user's own coaching notes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import { routeIdSchema } from "@/lib/route-id";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ vote: z.enum(["up", "down"]).nullable() });

export const POST = withUser(async (user, req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("coaching:write", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;
  try {
    const id = routeIdSchema.parse((await params).id);
    const { vote } = schema.parse(await req.json());
    const r = await prisma.coachingNote.updateMany({
      where: { id, userId: user.id },
      data: { feedback: vote, feedbackAt: vote ? new Date() : null },
    });
    if (r.count === 0) return NextResponse.json({ ok: false, error: "Note not found." }, { status: 404 });
    return NextResponse.json({ ok: true, feedback: vote });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please pick thumbs up, thumbs down, or clear it." });
  }
});
