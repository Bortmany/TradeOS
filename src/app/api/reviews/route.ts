import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { WEEK_KEY_PATTERN, normalizeWeekKey, weekKeyToDate } from "@/lib/reviews";

// Save (or re-save) the three guided answers for one week. One row per
// user + week, so posting again simply updates the trader's own answers.
const schema = z.object({
  weekStart: z.string().regex(WEEK_KEY_PATTERN, "Pick a week to review."),
  worked: z.string().max(2000).default(""),
  costliestRule: z.string().max(2000).default(""),
  oneChange: z.string().max(2000).default(""),
});

export const POST = withUser(async (user, req: Request) => {
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

    // Scoped to the signed-in user on both halves of the upsert.
    const existing = await prisma.weeklyReview.findFirst({
      where: { userId: user.id, weekStart: weekKeyToDate(weekKey) },
      select: { id: true },
    });

    if (existing) {
      await prisma.weeklyReview.update({ where: { id: existing.id }, data: { answers } });
    } else {
      await prisma.weeklyReview.create({
        data: { userId: user.id, weekStart: weekKeyToDate(weekKey), answers },
      });
    }

    return NextResponse.json({ ok: true, weekStart: weekKey });
  } catch (err) {
    return apiErrorResponse(err, {
      validationMessage: "Please check your review answers and try again.",
    });
  }
});
