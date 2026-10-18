// TradeOS — Anthropic (Claude) coaching provider. Optional layer behind the
// CoachingProvider interface; never used by scoring, rules or analytics.
// Outbound call: api.anthropic.com only, only while the AI switch is on.
// Sends aggregated numbers only: no name, email, account ids, symbols, prices,
// custom rule names or free-text notes (rules go as anonymous "Rule N" labels). Never throws into callers; never logs the API key.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type {
  CoachingProvider,
  CoachingContext,
  CoachingResult,
  TradeSummary,
  MistakeCluster,
  DailyJournalSummary,
  CoachingSuggestion,
} from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 500;
const TIMEOUT_MS = 20_000;
const MAX_VIOLATION_GROUPS = 10;

export const FALLBACK_MESSAGE = "Coaching isn't available right now. Please try again a little later.";
export const LIMIT_MESSAGE =
  "You've reached today's AI coaching limit. It resets within 24 hours. Your scores and analytics are unaffected.";
export const GLOBAL_LIMIT_MESSAGE =
  "AI coaching is very busy today and has paused until tomorrow. Your scores and analytics are unaffected.";

export const SYSTEM_PROMPT = [
  "You are a trading-discipline coach inside a journaling app.",
  "Coach on PROCESS only: following one's own rules, position-sizing discipline, journaling habits and emotional patterns.",
  "NEVER give trade signals, entries or exits, price predictions, market views, or financial advice. Never recommend or name instruments, and never say to buy or sell anything.",
  "You only see summary numbers, not individual trades. Do not guess at details you were not given.",
  "Be short, kind and direct, in plain English a beginner understands.",
  "Do not give personalised financial recommendations.",
  "Reply with ONLY the JSON object requested, no other text.",
].join(" ");

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function anthropicConfigured(): boolean {
  return process.env.AI_COACHING_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

type Gate = "ok" | "user" | "global";

// Counts real provider calls in the last 24h. DB-backed so it holds across
// several server instances. The use is recorded FIRST and then counted, so
// simultaneous requests can't all slip under the cap: whoever ends up over it
// removes their own row and is refused.
const PRUNE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export async function reserve(userId: string): Promise<Gate> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Best-effort tidy-up of old rows; never blocks or throws.
  void prisma.aiUsage
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - PRUNE_AFTER_MS) } } })
    .catch(() => undefined);
  const row = await prisma.aiUsage.create({ data: { userId }, select: { id: true } });
  const [mine, all] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since } } }),
  ]);
  const gate: Gate =
    mine > envInt("AI_DAILY_CAP_PER_USER", 10)
      ? "user"
      : all > envInt("AI_DAILY_CAP_GLOBAL", 500)
        ? "global"
        : "ok";
  if (gate !== "ok") await prisma.aiUsage.delete({ where: { id: row.id } }).catch(() => undefined);
  return gate;
}

const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

// The minimum the model needs: discipline components, rule-breach counts,
// and counts/streaks. Nothing that identifies the person or the trades.
export function buildFacts(ctx: CoachingContext) {
  // Custom rule names are user-typed text, so they never leave the server: rules
  // are grouped by name locally and sent only as "Rule 1", "Rule 2", ... (most
  // broken first).
  const groups = new Map<string, number>();
  for (const v of ctx.violations) {
    groups.set(v.ruleName, (groups.get(v.ruleName) ?? 0) + 1);
  }
  const d = ctx.discipline;
  const m = ctx.metrics;
  return {
    discipline: {
      overall: d.scored ? num(d.overall) : null,
      ruleAdherence: num(d.ruleAdherence),
      riskDiscipline: num(d.riskDiscipline),
      emotionalDiscipline: num(d.emotionalDiscipline),
      consistency: num(d.consistency),
      ruleChecks: d.ruleChecks,
    },
    ruleBreaches: [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_VIOLATION_GROUPS)
      .map(([, count], i) => ({ rule: `Rule ${i + 1}`, count })),
    counts: {
      trades: m.tradeCount,
      wins: m.winCount,
      losses: m.lossCount,
      currentStreak: m.currentStreak,
    },
    periodDays: Math.max(
      1,
      Math.round((ctx.timeframe.to.getTime() - ctx.timeframe.from.getTime()) / 86_400_000)
    ),
  };
}

const text = z.string().max(600);
const schemas = {
  trade: z.object({ headline: text, detail: text }),
  clusters: z.array(z.object({ label: text, count: z.number(), suggestion: text })).max(5),
  day: z.object({
    summary: text,
    wins: z.array(text).max(5),
    mistakes: z.array(text).max(5),
    focusTomorrow: text,
  }),
  suggestions: z
    .array(z.object({ title: text, body: text, priority: z.enum(["low", "medium", "high"]) }))
    .max(5),
};

function extractJson(raw: string): unknown {
  const start = raw.search(/[\[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

class AnthropicCoachingProvider implements CoachingProvider {
  // Read fresh so the switch reflects the current environment.
  get enabled() {
    return anthropicConfigured();
  }

  private async run<T>(
    ctx: CoachingContext,
    task: string,
    shape: string,
    schema: z.ZodType<T>,
    extra: Record<string, unknown> = {}
  ): Promise<CoachingResult<T>> {
    const unavailable = (message = FALLBACK_MESSAGE): CoachingResult<T> => ({
      enabled: true,
      data: null,
      message,
    });
    try {
      if (!anthropicConfigured()) {
        return { enabled: false, data: null, message: FALLBACK_MESSAGE };
      }
      const gate = await reserve(ctx.userId);
      if (gate === "user") return unavailable(LIMIT_MESSAGE);
      if (gate === "global") return unavailable(GLOBAL_LIMIT_MESSAGE);

      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: TIMEOUT_MS,
        maxRetries: 1,
      });
      const res = await client.messages.create({
        model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Task: ${task}\nReturn JSON shaped like: ${shape}\nSummary numbers:\n${JSON.stringify({ ...buildFacts(ctx), ...extra })}`,
          },
        ],
      });
      const raw = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      const parsed = schema.safeParse(extractJson(raw));
      if (!parsed.success) return unavailable();
      return { enabled: true, data: parsed.data };
    } catch {
      // Deliberately silent: errors can carry request details.
      return unavailable();
    }
  }

  async summarizeTrade(ctx: CoachingContext, tradeId: string): Promise<CoachingResult<TradeSummary>> {
    const t = ctx.trades.find((x) => x.id === tradeId);
    if (!t) return { enabled: true, data: null, message: FALLBACK_MESSAGE };
    const holdMin =
      t.exitTime ? Math.max(0, Math.round((t.exitTime.getTime() - t.entryTime.getTime()) / 60000)) : null;
    const r = await this.run(
      ctx,
      "Give a short process-focused note on how this one trade followed the trader's rules. Do not comment on the market.",
      '{"headline": string, "detail": string}',
      schemas.trade,
      {
        trade: {
          won: t.isWin,
          ruleComplianceScore: t.complianceScore ?? null,
          ruleBreaches: t.violationCount ?? 0,
          heldMinutes: holdMin,
        },
      }
    );
    return { ...r, data: r.data ? { tradeId, ...r.data } : null };
  }

  async clusterMistakes(ctx: CoachingContext): Promise<CoachingResult<MistakeCluster[]>> {
    const r = await this.run(
      ctx,
      "Group the repeated rule breaches into up to 5 process themes, each with one kind, practical habit suggestion.",
      '[{"label": string, "count": number, "suggestion": string}]',
      schemas.clusters
    );
    return {
      ...r,
      data: r.data ? r.data.map((c) => ({ ...c, exampleTradeIds: [] })) : null,
    };
  }

  async summarizeDay(ctx: CoachingContext, date: string): Promise<CoachingResult<DailyJournalSummary>> {
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
    const r = await this.run(
      ctx,
      "Write a short end-of-day discipline review: what went well, what to watch, one focus for tomorrow.",
      '{"summary": string, "wins": string[], "mistakes": string[], "focusTomorrow": string}',
      schemas.day
    );
    return { ...r, data: r.data ? { date: safeDate, ...r.data } : null };
  }

  async suggestImprovements(ctx: CoachingContext): Promise<CoachingResult<CoachingSuggestion[]>> {
    return this.run(
      ctx,
      "Suggest up to 3 small habit improvements for rule-following, sizing discipline, journaling or emotional control.",
      '[{"title": string, "body": string, "priority": "low"|"medium"|"high"}]',
      schemas.suggestions
    );
  }
}

export const anthropicProvider = new AnthropicCoachingProvider();
