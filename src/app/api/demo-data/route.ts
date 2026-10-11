import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { loadSampleData } from "@/lib/demo";
import { rateLimit, enforceUserRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { purgeStoredFiles } from "@/lib/attachments";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";
import { refuseDemo } from "@/lib/demo-guard";

// One-click activation: populate a new user's account with realistic sample
// trades + a starter rulebook so they see the product working immediately.
export const POST = withUser(async (user) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  // This does a bulk insert — don't let it be hammered. 5 per user / 10 min.
  const limit = rateLimit(`demo-data:${user.id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Please wait a moment before trying that again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const result = await loadSampleData(user.id);
    if (result.skipped) {
      return NextResponse.json({
        ok: false,
        error: "You already have trades — sample data is only for empty accounts.",
      });
    }
    return NextResponse.json({ ok: true, created: result.created });
  } catch (err) {
    // Never echo a raw internal error message to the client.
    return apiErrorResponse(err);
  }
});

// "Clear sample trades": removes ONLY this user's trades that came from "Load
// sample data" (source "sample"). Trades they imported or typed in, their
// accounts and their rulebooks are never touched.
export const DELETE = withUser(async (user) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("demo-data:clear", user.id);
  if (limited) return limited;

  try {
    const where = { userId: user.id, source: "sample" } as const;
    // Remove the stored screenshots of those trades first; rows go with the trades.
    const ids = (await prisma.trade.findMany({ where, select: { id: true } })).map((t) => t.id);
    for (const tradeId of ids) await purgeStoredFiles({ tradeId });
    const { count } = await prisma.trade.deleteMany({ where });
    await recomputeCompliance(user.id);
    return NextResponse.json({ ok: true, cleared: count });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
