// TradeOS — create + run a backtest. The run executes synchronously (both
// engines are pure array walks over capped inputs) and every attempt is
// recorded: a config that parses but fails in the engine is persisted as a
// `failed` run so the Testing Portal keeps an honest history. Backtests never
// write trades, evaluations or snapshots — no compliance recompute here.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { hasFeature } from "@/lib/billing/plans";
import { getTrades } from "@/lib/data";
import { parseRuleConfig } from "@/lib/rules/config";
import type { EvalContext, RuleLike } from "@/lib/rules/engine";
import {
  ReplayConfigSchema,
  SimConfigSchema,
  type Candle,
  type Plan,
  type RuleType,
  type Severity,
} from "@/lib/types";
import {
  runReplay,
  runSimulation,
  assembleResults,
  etDateStartUtc,
  etDateEndUtc,
  type RuleScope,
} from "@/lib/backtest";

const nameFields = {
  name: z.string().min(1).max(120),
  notes: z.string().max(5000).optional().nullable(),
};

const schema = z.discriminatedUnion("kind", [
  ReplayConfigSchema.extend(nameFields),
  SimConfigSchema.extend(nameFields),
]);

const TRADE_QUERY_CAP = 10000; // getTrades' hard take — surfaced as `truncated`
const MAX_RUNS_PER_USER = 200; // total recorded tests — rate limits bound only the rate

export const POST = withUser(async (user, req: Request) => {
  // Runs are CPU-heavy relative to normal writes — import-route tier limit.
  const rl = rateLimit(`backtests:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many backtests in a short time. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  if (!hasFeature(user.plan as Plan, user.billingStatus, "backtesting")) {
    return NextResponse.json(
      { ok: false, error: "Backtesting is a Pro feature. Upgrade to run strategy tests." },
      { status: 403 }
    );
  }

  try {
    const d = schema.parse(await req.json());
    const { name, notes, ...config } = d;

    const runCount = await prisma.backtestRun.count({ where: { userId: user.id } });
    if (runCount >= MAX_RUNS_PER_USER) {
      return NextResponse.json(
        {
          ok: false,
          error: `You've reached the limit of ${MAX_RUNS_PER_USER} recorded tests. Delete old tests to make room.`,
        },
        { status: 400 }
      );
    }

    if (d.kind === "replay") {
      // Ownership-check every referenced id before touching data.
      if (d.accountId) {
        const account = await prisma.tradingAccount.findFirst({
          where: { id: d.accountId, userId: user.id },
          select: { id: true },
        });
        if (!account) {
          return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
        }
      }

      let rules: RuleLike[] | null = null;
      let ruleScope: RuleScope | undefined;
      if (d.ruleBookId) {
        const book = await prisma.ruleBook.findFirst({
          where: { id: d.ruleBookId, userId: user.id },
          include: { rules: { where: { isActive: true }, orderBy: { order: "asc" } } },
        });
        if (!book) {
          return NextResponse.json({ ok: false, error: "Rulebook not found." }, { status: 404 });
        }
        ruleScope = { scope: book.scope, scopeValue: book.scopeValue };
        rules = book.rules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type as RuleType,
          severity: r.severity as Severity,
          weight: r.weight,
          config: safeConfig(r.type as RuleType, r.config),
        }));
      }

      // The window dates are ET calendar days (from = ET midnight, to = ET
      // end-of-day inclusive) — the engine re-applies the same boundaries.
      const trades = await getTrades(user.id, {
        accountId: d.accountId,
        from: d.from ? etDateStartUtc(d.from) : undefined,
        to: d.to ? etDateEndUtc(d.to) : undefined,
        onlyClosed: true,
      });

      // Screenshot context for setup_validation rules — same source recompute
      // uses (Attachment rows of kind "screenshot").
      let ctxByTradeId: Record<string, EvalContext> | undefined;
      if (rules && rules.some((r) => r.type === "setup_validation")) {
        const shots = await prisma.attachment.findMany({
          where: { kind: "screenshot", trade: { userId: user.id } },
          select: { tradeId: true },
        });
        ctxByTradeId = {};
        for (const s of shots) ctxByTradeId[s.tradeId] = { hasScreenshot: true };
      }

      const outcome = runReplay(trades, d, rules, ruleScope, ctxByTradeId);
      const results = assembleResults({
        variant: outcome.variantTrades,
        baseline: outcome.baselineTrades,
        exclusions: outcome.exclusions,
        truncated: trades.length >= TRADE_QUERY_CAP,
      });

      const run = await prisma.backtestRun.create({
        data: {
          userId: user.id,
          name,
          kind: "replay",
          status: "completed",
          config: JSON.stringify(config),
          results: JSON.stringify(results),
          notes: notes ?? null,
        },
      });
      return NextResponse.json({ ok: true, id: run.id });
    }

    // Simulation path.
    if (d.strategy === "ma_cross" && d.fastPeriod >= d.slowPeriod) {
      return NextResponse.json(
        { ok: false, error: "The fast MA period must be smaller than the slow MA period." },
        { status: 400 }
      );
    }
    const dataset = await prisma.marketDataset.findFirst({
      where: { id: d.datasetId, userId: user.id },
    });
    if (!dataset) {
      return NextResponse.json({ ok: false, error: "Dataset not found." }, { status: 404 });
    }

    let candles: Candle[];
    try {
      candles = JSON.parse(dataset.candles) as Candle[];
      if (!Array.isArray(candles)) throw new Error("not an array");
    } catch {
      return NextResponse.json(
        { ok: false, error: "This dataset is unreadable. Delete it and upload again." },
        { status: 400 }
      );
    }

    try {
      const simTrades = runSimulation(candles, d, dataset.symbol);
      const results = assembleResults({ variant: simTrades, baseline: null, exclusions: [] });
      const run = await prisma.backtestRun.create({
        data: {
          userId: user.id,
          name,
          kind: "simulation",
          status: "completed",
          config: JSON.stringify(config),
          results: JSON.stringify(results),
          notes: notes ?? null,
          datasetId: dataset.id,
        },
      });
      return NextResponse.json({ ok: true, id: run.id });
    } catch (engineErr) {
      // Record the failed attempt so the portal history stays honest.
      const message = engineErr instanceof Error ? engineErr.message : "Simulation failed.";
      await prisma.backtestRun.create({
        data: {
          userId: user.id,
          name,
          kind: "simulation",
          status: "failed",
          config: JSON.stringify(config),
          results: JSON.stringify({ error: message }),
          notes: notes ?? null,
          datasetId: dataset.id,
        },
      });
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? "Please check the backtest settings."
        : err instanceof Error
          ? err.message
          : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});

function safeConfig(type: RuleType, raw: string): unknown {
  try {
    return parseRuleConfig(type, JSON.parse(raw));
  } catch {
    return {};
  }
}
