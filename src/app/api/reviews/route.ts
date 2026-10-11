import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";
import {
  INVALID_WEEK_MESSAGE,
  WEEK_KEY_PATTERN,
  isRealDateKey,
  normalizeWeekKey,
  weekKeyToDate,
} from "@/lib/reviews";

// Save (or re-save) the three guided answers for one week. One row per
// user + week, so posting again simply updates the trader's own answers.
const schema = z.object({
  weekStart: z
    .string()
    .regex(WEEK_KEY_PATTERN, "Pick a week to review.")
    .refine(isRealDateKey, INVALID_WEEK_MESSAGE),
  worked: z.string().max(2000).default(""),
  costliestRule: z.string().max(2000).default(""),
  oneChange: z.string().max(2000).default(""),
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("reviews:write", user.id);
  if (limited) return limited;

  try {
    const d = schema.parse(await req.json());

    // Snap whatever came in to the Monday of that week, so the unique
    // [userId, weekStart] key can never be split across two rows.
    const weekKey = normalizeWeekKey(d.weekStart);
    const answers = JSON.stringify({
      worked: d.worked.trim(),
      costliestRule: d.costliestRule.trim(),
      oneChange: d.oneChange.trim(),
    });

    // One atomic write on the unique [userId, weekStart] key, scoped to the
    // signed-in user: two saves racing each other can never create a duplicate
    // row or fail on the unique constraint.
    const weekStart = weekKeyToDate(weekKey);
    await prisma.weeklyReview.upsert({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      update: { answers },
      create: { userId: user.id, weekStart, answers },
    });

    return NextResponse.json({ ok: true, weekStart: weekKey });
  } catch (err) {
    // An impossible week gets its own plain-English message, not the generic one.
    if (err instanceof z.ZodError && err.issues.some((i) => i.message === INVALID_WEEK_MESSAGE)) {
      return NextResponse.json({ ok: false, error: INVALID_WEEK_MESSAGE }, { status: 400 });
    }
    return apiErrorResponse(err, {
      validationMessage: "Please check your review answers and try again.",
    });
  }
});
