// TradeOS — what the trade page shows for the pre-trade checklist: the run
// linked to this trade, or (when none is) the closest unlinked run saved up to
// 4 hours before entry. Suggesting never links anything; the trader taps.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { suggestionQuerySchema } from "@/lib/checklist";
import { getTradeChecklistState } from "@/lib/checklist/data";

export const GET = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("checklists:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;
  try {
    const q = suggestionQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const state = await getTradeChecklistState(user.id, q.tradeId);
    if (!state) return NextResponse.json({ ok: false, error: "Trade not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the trade you chose." });
  }
});
