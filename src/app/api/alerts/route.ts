// GET /api/alerts — the signed-in user's open, not-dismissed alerts, plus how
// fresh each live broker link is and the latest open positions. The dashboard
// polls this about once a minute. Read-only; every query is filtered by the
// session user's id. Rate limit: USER_READ_LIMIT (120/min/user).

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { getLiveSnapshot } from "@/lib/live/snapshot";
import { apiErrorResponse } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const limited = enforceUserRateLimit("alerts:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    const snapshot = await getLiveSnapshot(user.id);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Could not load your alerts." });
  }
});
