// TradeOS — the coaching desk's state. Read-only; never calls the model.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { getCoachingStatus } from "@/lib/ai/status";

export const GET = withUser(async (user) => {
  const limited = enforceUserRateLimit("coaching:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    return NextResponse.json({ ok: true, ...(await getCoachingStatus(user)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
