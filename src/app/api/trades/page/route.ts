import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { getTradesPage, InvalidCursorError } from "@/lib/data";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { isDayKey } from "@/lib/et-days";
import { toJournalRow, JOURNAL_PAGE_MAX, JOURNAL_PAGE_SIZE } from "@/lib/journal-rows";
import { TRADE_SOURCES } from "@/lib/types";

// GET /api/trades/page — one page of the signed-in trader's journal, newest
// first, for the "Load older trades" button. Read-only. The user is always the
// session's user: a `userId` in the query is ignored (zod strips unknown keys).

// An empty query value ("?symbol=") means "no filter", not "match empty text".
const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().min(1).max(max).optional());

const dayKey = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().refine(isDayKey, "Use a real date in the form YYYY-MM-DD.").optional()
);

const querySchema = z
  .object({
    // Server-side cap: a page is never larger than JOURNAL_PAGE_MAX (100).
    limit: z.coerce.number().int().min(1).max(JOURNAL_PAGE_MAX).default(JOURNAL_PAGE_SIZE),
    cursor: optionalText(200),
    account: optionalText(64),
    symbol: optionalText(40),
    strategy: optionalText(120),
    source: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.enum(TRADE_SOURCES).optional()
    ),
    outcome: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.enum(["win", "loss"]).optional()
    ),
    from: dayKey,
    to: dayKey,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "The end date is before the start date.",
    path: ["to"],
  });

export const GET = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("trades:page", user.id, USER_READ_LIMIT);
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const q = querySchema.parse(Object.fromEntries(url.searchParams));
    const page = await getTradesPage(user.id, {
      limit: q.limit,
      cursor: q.cursor ?? null,
      filter: {
        accountId: q.account,
        symbol: q.symbol,
        strategyTag: q.strategy,
        source: q.source,
        outcome: q.outcome,
        fromDay: q.from,
        toDay: q.to,
      },
    });
    return NextResponse.json({
      ok: true,
      rows: page.rows.map(toJournalRow),
      nextCursor: page.nextCursor,
      total: page.total,
    });
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    return apiErrorResponse(err, {
      validationMessage: "Those journal filters aren't valid. Clear them and try again.",
    });
  }
});
