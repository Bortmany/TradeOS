// POST /api/alerts/[id]/dismiss — hide one alert at its current step.
//
// The alert stays hidden (even after a reload or on another device) while the
// measure stays at that step or lower. It comes back only when the measure
// reaches a higher step, or after the condition cleared and happened again (the
// generator then makes a new row). Session-checked, zod on the id, the lookup is
// filtered by the signed-in user (another user's id answers 404 exactly like a
// missing one), behind USER_WRITE_LIMIT, and the demo desk is refused.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { refuseDemo } from "@/lib/demo-guard";
import { apiErrorResponse } from "@/lib/api-error";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(64);

export const POST = withUser(async (user, _req: Request, { params }: Ctx) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("alerts:dismiss", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;

  try {
    const id = idSchema.parse((await params).id);
    const alert = await prisma.alert.findFirst({
      where: { id, userId: user.id, status: "open" },
      select: { id: true, meta: true },
    });
    if (!alert) {
      return NextResponse.json({ ok: false, error: "Alert not found." }, { status: 404 });
    }

    let meta: Record<string, unknown> = {};
    try {
      const parsed = alert.meta ? JSON.parse(alert.meta) : {};
      if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
    } catch {
      /* hand-made alert with no usable meta: dismiss still works */
    }
    const step = meta.step === 50 || meta.step === 80 || meta.step === 100 ? meta.step : 0;

    await prisma.alert.updateMany({
      where: { id: alert.id, userId: user.id },
      data: {
        dismissedAt: new Date(),
        meta: JSON.stringify({ ...meta, dismissedStep: step }),
      },
    });
    return NextResponse.json({ ok: true, step });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "That alert id is not valid." });
  }
});
