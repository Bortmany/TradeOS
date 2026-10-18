// TradeOS — the one entry point for making a coaching note. Order of work is
// fixed (see docs/specs/ai-coaching.md 6.1): owner switch, user switch, plan,
// context, cache, provider call, validate, save. The deterministic core never
// imports from here. There is no demo branch: the demo desk is refused by the
// POST route and sees canned samples (./demo.ts) through the GET routes.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { mapTrade } from "@/lib/data";
import { etDayKey, etDateStartUtc, etDateEndUtc } from "@/lib/backtest/time";
import { isRealDateKey, normalizeWeekKey, shiftWeekKey, weekEndKey, weekKeyOf } from "@/lib/reviews";
import type { Plan } from "@/lib/types";
import { getCoachingProvider, isCoachingEnabled } from "./index";
import { buildPayload, taskExtras, DEFAULT_MODEL, FALLBACK_MESSAGE, LIMIT_MESSAGE, GLOBAL_LIMIT_MESSAGE } from "./anthropic";
import { buildCoachingContext } from "./context";
import { aiCacheHours, coachingDailyCapFor } from "./limits";
import { noteContentSchemas, toNoteDTO, type NoteDTO } from "./notes";
import { FOCUS_AREAS, TONES, type CoachingContext, type CoachingTone, type FocusArea, type NoteKind } from "./types";

export interface CoachingUser {
  id: string;
  email: string;
  plan: string;
  billingStatus: string;
}

export interface CoachingRequest {
  kind: NoteKind;
  tradeId?: string;
  date?: string; // YYYY-MM-DD (ET)
  weekStart?: string; // YYYY-MM-DD
}

export type CoachingFailCode =
  | "disabled"
  | "user_off"
  | "plan"
  | "not_found"
  | "no_data"
  | "week_open"
  | "bad_request"
  | "limit"
  | "global_limit"
  | "unavailable";

export type CoachingOutcome =
  | { ok: true; note: NoteDTO; cached: boolean; usage: { used: number; limit: number } }
  | { ok: false; code: CoachingFailCode; error: string; status: number };

const FAILS: Record<CoachingFailCode, { status: number; error: string }> = {
  disabled: { status: 503, error: "AI coaching isn't switched on for this site yet." },
  user_off: { status: 403, error: "You've turned the AI coach off. Switch it back on in Settings." },
  plan: { status: 403, error: "AI coaching isn't included in your plan." },
  not_found: { status: 404, error: "That trade wasn't found." },
  no_data: { status: 422, error: "Not enough trades in this period to coach on yet." },
  week_open: { status: 422, error: "That week isn't finished yet." },
  bad_request: { status: 400, error: "That request wasn't valid. Pick a real day or week that isn't in the future." },
  limit: { status: 429, error: LIMIT_MESSAGE },
  global_limit: { status: 429, error: GLOBAL_LIMIT_MESSAGE },
  unavailable: { status: 502, error: FALLBACK_MESSAGE },
};

function fail(code: CoachingFailCode): CoachingOutcome {
  return { ok: false, code, ...FAILS[code] };
}

const DAY_MS = 86_400_000;

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseFocusAreas(raw: string | null): FocusArea[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return FOCUS_AREAS.filter((a) => v.includes(a));
  } catch {
    return [];
  }
}

/** Unscheduled AiUsage rows in the last 24 hours: what counts toward the user's daily cap. */
export async function usedToday(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.aiUsage.count({
    where: { userId, scheduled: false, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });
}

/** The coach's own newest focus sentence: open, or done within the last 7 days. */
async function previousFocusFor(userId: string, now: Date) {
  const row = await prisma.coachingFocus.findFirst({
    where: {
      userId,
      OR: [
        { status: "open" },
        { status: "done", doneAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    text: row.text,
    done: row.status === "done",
    ageDays: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / DAY_MS)),
  };
}

export async function generateCoachingNote(
  user: CoachingUser,
  req: CoachingRequest,
  opts: { scheduled?: boolean; now?: Date } = {}
): Promise<CoachingOutcome> {
  const scheduled = opts.scheduled === true;
  const now = opts.now ?? new Date();
  const kind = req.kind;

  // 1. Owner switch.
  if (!isCoachingEnabled()) return fail("disabled");

  // 3. User preference (and the fixed-label preferences the prompt uses).
  const prefs = await prisma.user.findUnique({
    where: { id: user.id },
    select: { coachingEnabled: true, coachingTone: true, coachingFocusAreas: true },
  });
  if (!prefs) return fail("not_found");
  if (!prefs.coachingEnabled) return fail("user_off");

  // Plan cap. 0 = this plan gets no coaching. The weekly job is not charged.
  const planCap = coachingDailyCapFor(user.plan as Plan, user.billingStatus);
  if (!scheduled && planCap === 0) return fail("plan");

  // 4. Window and subject.
  let subjectKey: string;
  let from: Date;
  let to: Date;
  let tradeRow: Awaited<ReturnType<typeof prisma.trade.findFirst>> = null;
  if (kind === "suggestions" || kind === "clusters") {
    subjectKey = "30d";
    const today = etDayKey(now);
    from = etDateStartUtc(addDays(today, -29));
    to = etDateEndUtc(today);
  } else if (kind === "day") {
    const date = req.date ?? "";
    if (!isRealDateKey(date) || date > etDayKey(now)) return fail("bad_request");
    subjectKey = date;
    from = etDateStartUtc(date);
    to = etDateEndUtc(date);
  } else if (kind === "trade") {
    if (!req.tradeId) return fail("bad_request");
    tradeRow = await prisma.trade.findFirst({ where: { id: req.tradeId, userId: user.id } });
    if (!tradeRow) return fail("not_found");
    subjectKey = tradeRow.id;
    const dayKey = etDayKey(tradeRow.entryTime);
    from = etDateStartUtc(addDays(dayKey, -29));
    to = etDateEndUtc(dayKey);
  } else {
    const current = weekKeyOf(now);
    let week: string;
    if (scheduled) {
      week = shiftWeekKey(current, -1); // the week that just finished
    } else {
      try {
        week = req.weekStart ? normalizeWeekKey(req.weekStart, now) : shiftWeekKey(current, -1);
      } catch {
        return fail("bad_request");
      }
      if (week >= current) return fail("week_open");
    }
    subjectKey = week;
    from = etDateStartUtc(week);
    to = etDateEndUtc(weekEndKey(week));
  }

  // 5. Context.
  const base = await buildCoachingContext(user.id, { from, to });
  if (!base) return fail("no_data");
  if (tradeRow && !base.trades.some((t) => t.id === tradeRow!.id)) base.trades.push(mapTrade(tradeRow));

  const tone: CoachingTone = (TONES as readonly string[]).includes(prefs.coachingTone)
    ? (prefs.coachingTone as CoachingTone)
    : "gentle";
  const wantsPrevious = kind === "day" || kind === "suggestions" || kind === "weekly";
  const ctx: CoachingContext = {
    ...base,
    kind,
    limits: { dailyCap: scheduled ? null : planCap },
    preferences: { tone, focusAreas: parseFocusAreas(prefs.coachingFocusAreas) },
    previousFocus: wantsPrevious ? await previousFocusFor(user.id, now) : null,
  };

  // 6. Cache key: exactly what would be sent.
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const extras = taskExtras(kind, ctx, subjectKey) ?? {};
  const payload = buildPayload(ctx, extras);
  const inputHash = createHash("sha256").update(`${kind}|${subjectKey}|${model}|${payload}`).digest("hex");

  // 7. Cache lookup.
  const since = new Date(now.getTime() - aiCacheHours() * 3_600_000);
  const hit = await prisma.coachingNote.findFirst({
    where: { userId: user.id, kind, subjectKey, inputHash, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
  if (hit) {
    // updateMany so a note deleted in between can't throw; none touched = generate fresh.
    const bumped = await prisma.coachingNote.updateMany({
      where: { id: hit.id, userId: user.id },
      data: { servedCount: { increment: 1 } },
    });
    if (bumped.count > 0) {
      return {
        ok: true,
        note: toNoteDTO(hit),
        cached: true,
        usage: { used: await usedToday(user.id, now), limit: planCap },
      };
    }
  }

  // 8. Provider call.
  const provider = getCoachingProvider();
  const res =
    kind === "suggestions"
      ? await provider.suggestImprovements(ctx)
      : kind === "clusters"
        ? await provider.clusterMistakes(ctx)
        : kind === "day"
          ? await provider.summarizeDay(ctx, subjectKey)
          : kind === "trade"
            ? await provider.summarizeTrade(ctx, subjectKey)
            : await provider.summarizeWeek(ctx, subjectKey);
  if (!res.enabled) return fail("disabled");
  if (!res.data) return fail(res.code === "limit" || res.code === "global_limit" ? res.code : "unavailable");

  // 9. Validate, save, report.
  const raw: unknown =
    kind === "suggestions" || kind === "clusters"
      ? { items: kind === "clusters" ? (res.data as { label: string; count: number; suggestion: string }[]).map(
          ({ label, count, suggestion }) => ({ label, count, suggestion })
        ) : res.data }
      : res.data;
  const parsed = noteContentSchemas[kind].safeParse(raw);
  if (!parsed.success) {
    if (res.usageId) {
      await prisma.aiUsage.update({ where: { id: res.usageId }, data: { ok: false } }).catch(() => undefined);
    }
    return fail("unavailable");
  }
  // A simultaneous request may have saved the same note while we waited on the model.
  const raced = await prisma.coachingNote.findFirst({
    where: { userId: user.id, kind, subjectKey, inputHash, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
  if (raced) {
    const bumped = await prisma.coachingNote.updateMany({
      where: { id: raced.id, userId: user.id },
      data: { servedCount: { increment: 1 } },
    });
    if (bumped.count > 0) {
      return {
        ok: true,
        note: toNoteDTO(raced),
        cached: true,
        usage: { used: await usedToday(user.id, now), limit: planCap },
      };
    }
  }
  const row = await prisma.coachingNote.create({
    data: {
      userId: user.id,
      kind,
      subjectKey,
      inputHash,
      content: JSON.stringify(parsed.data),
      model: res.usage?.model ?? model,
      source: "ai",
    },
  });
  return {
    ok: true,
    note: toNoteDTO(row),
    cached: false,
    usage: { used: await usedToday(user.id, now), limit: planCap },
  };
}
