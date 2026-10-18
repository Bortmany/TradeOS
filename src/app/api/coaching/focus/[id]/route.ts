// TradeOS — mark a focus item done, dismissed, or open again.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import { routeIdSchema } from "@/lib/route-id";
import { MAX_OPEN_FOCUS, focusFullBody } from "@/lib/ai/notes";
import { toFocusDTO } from "@/lib/ai/status";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ status: z.enum(["open", "done", "dismissed"]) });

export const PATCH = withUser(async (user, req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("coaching:write", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;
  try {
    const id = routeIdSchema.parse((await params).id);
    const { status } = schema.parse(await req.json());
    if (status === "open") {
      // Reopening counts toward the same cap as adding. An item that is already open stays allowed.
      const current = await prisma.coachingFocus.findFirst({ where: { id, userId: user.id }, select: { status: true } });
      if (current && current.status !== "open") {
        const open = await prisma.coachingFocus.count({ where: { userId: user.id, status: "open" } });
        if (open >= MAX_OPEN_FOCUS) return NextResponse.json(focusFullBody, { status: 409 });
      }
    }
    const r = await prisma.coachingFocus.updateMany({
      where: { id, userId: user.id },
      data: { status, doneAt: status === "done" ? new Date() : null },
    });
    if (r.count === 0) return NextResponse.json({ ok: false, error: "Focus item not found." }, { status: 404 });
    const item = await prisma.coachingFocus.findFirst({ where: { id, userId: user.id } });
    return NextResponse.json({ ok: true, item: toFocusDTO(item!) });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please pick open, done or dismissed." });
  }
});
