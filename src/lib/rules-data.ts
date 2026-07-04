// TradeOS — Rule Engine data-access layer.
// Loads a user's rulebooks (active + inactive) with their rules, and joins in
// pass/fail evaluation counts (grouped by ruleId + status) to derive per-rule,
// per-book, and overall adherence. Also exposes `describeRuleConfig`, a pure
// helper that renders a rule's opaque JSON `config` blob into a compact,
// human-readable summary for the UI.

import "server-only";
import { prisma } from "@/lib/db";
import { coerceConfig } from "@/lib/rules/config";
import { RULE_TYPES, type RuleType } from "@/lib/types";

// --------------------------------------------------------------------------
// Shapes returned to the UI
// --------------------------------------------------------------------------

export interface RuleWithStats {
  id: string;
  name: string;
  type: RuleType;
  severity: string;
  weight: number;
  isActive: boolean;
  order: number;
  config: string; // raw JSON string (as stored)
  summary: string; // describeRuleConfig(type, config)
  passCount: number;
  failCount: number;
  adherence: number; // 0-100 (100 when nothing evaluated yet)
}

export interface RuleBookWithStats {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  scope: string;
  scopeValue: string | null;
  rules: RuleWithStats[];
  passCount: number;
  failCount: number;
  adherence: number; // 0-100
}

export interface RuleBooksResult {
  books: RuleBookWithStats[];
  passCount: number;
  failCount: number;
  adherence: number; // overall, 0-100
  ruleCount: number;
}

// --------------------------------------------------------------------------
// Human-readable labels for rule types (shared with the UI)
// --------------------------------------------------------------------------

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  time_window: "Time Window",
  risk_limit: "Risk Limit",
  max_trades: "Max Trades",
  max_contracts: "Max Contracts",
  max_daily_loss: "Daily Loss",
  indicator: "Indicator",
  behavioral: "Behavioral",
  setup_validation: "Setup",
};

function isRuleType(t: string): t is RuleType {
  return (RULE_TYPES as readonly string[]).includes(t);
}

function adherencePct(pass: number, fail: number): number {
  const total = pass + fail;
  if (total === 0) return 100;
  return Math.round((pass / total) * 100);
}

// --------------------------------------------------------------------------
// getRuleBooksWithStats — the page's single data call.
// --------------------------------------------------------------------------

export async function getRuleBooksWithStats(userId: string): Promise<RuleBooksResult> {
  const [books, grouped] = await Promise.all([
    prisma.ruleBook.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { rules: { orderBy: { order: "asc" } } },
    }),
    prisma.ruleEvaluation.groupBy({
      by: ["ruleId", "status"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  // ruleId -> { pass, fail }
  const counts = new Map<string, { pass: number; fail: number }>();
  for (const g of grouped) {
    const entry = counts.get(g.ruleId) ?? { pass: 0, fail: 0 };
    if (g.status === "pass") entry.pass += g._count._all;
    else if (g.status === "fail") entry.fail += g._count._all;
    counts.set(g.ruleId, entry);
  }

  let totalPass = 0;
  let totalFail = 0;
  let ruleCount = 0;

  const mapped: RuleBookWithStats[] = books.map((book) => {
    let bookPass = 0;
    let bookFail = 0;

    const rules: RuleWithStats[] = book.rules.map((r) => {
      const c = counts.get(r.id) ?? { pass: 0, fail: 0 };
      bookPass += c.pass;
      bookFail += c.fail;
      ruleCount += 1;
      const type = isRuleType(r.type) ? r.type : "time_window";
      return {
        id: r.id,
        name: r.name,
        type,
        severity: r.severity,
        weight: r.weight,
        isActive: r.isActive,
        order: r.order,
        config: r.config,
        summary: describeRuleConfig(type, r.config),
        passCount: c.pass,
        failCount: c.fail,
        adherence: adherencePct(c.pass, c.fail),
      };
    });

    totalPass += bookPass;
    totalFail += bookFail;

    return {
      id: book.id,
      name: book.name,
      description: book.description,
      isActive: book.isActive,
      scope: book.scope,
      scopeValue: book.scopeValue,
      rules,
      passCount: bookPass,
      failCount: bookFail,
      adherence: adherencePct(bookPass, bookFail),
    };
  });

  return {
    books: mapped,
    passCount: totalPass,
    failCount: totalFail,
    adherence: adherencePct(totalPass, totalFail),
    ruleCount,
  };
}

// --------------------------------------------------------------------------
// describeRuleConfig — render a config blob into a one-line summary.
// Never throws: a malformed config degrades to the type label.
// --------------------------------------------------------------------------

const TZ_ABBR: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
  UTC: "UTC",
};

function money(n: unknown): string {
  const v = Number(n);
  if (!isFinite(v)) return "$0";
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function describeRuleConfig(type: RuleType, configJson: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = coerceConfig(configJson) as any;
  try {
    switch (type) {
      case "time_window": {
        if (!c.start || !c.end) return "Time window";
        const tz = TZ_ABBR[c.timezone] ?? c.timezone ?? "";
        return `${c.start}–${c.end}${tz ? ` ${tz}` : ""}`;
      }
      case "risk_limit": {
        const parts: string[] = [];
        if (c.maxLossPerTrade != null) parts.push(`Max loss ${money(c.maxLossPerTrade)}/trade`);
        if (c.maxRiskPct != null) parts.push(`Max risk ${c.maxRiskPct}%`);
        return parts.length ? parts.join(" · ") : "Risk limit";
      }
      case "max_trades":
        return c.maxPerDay != null ? `Max ${c.maxPerDay} trades/day` : "Max trades/day";
      case "max_contracts":
        return c.maxContracts != null ? `Max ${c.maxContracts} contracts` : "Max contracts";
      case "max_daily_loss":
        return c.maxDailyLoss != null ? `Max daily loss ${money(c.maxDailyLoss)}` : "Max daily loss";
      case "behavioral": {
        if (c.kind === "overtrading") {
          return `Max ${c.threshold ?? 3} trades within ${c.windowMinutes ?? 15}m`;
        }
        return `No revenge trade within ${c.withinMinutes ?? 5}m`;
      }
      case "indicator":
        return c.requireTag ? `Requires "${c.requireTag}" tag` : "Requires setup tag";
      case "setup_validation": {
        const reqs: string[] = [];
        if (c.requireStrategyTag) reqs.push("strategy tag");
        if (c.requireNotes) reqs.push("notes");
        if (c.requireScreenshot) reqs.push("screenshot");
        return reqs.length ? `Requires ${reqs.join(", ")}` : "No requirements";
      }
      default:
        return "Rule";
    }
  } catch {
    return RULE_TYPE_LABELS[type] ?? "Rule";
  }
}
