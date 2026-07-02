// TradeOS — Trade Journal data-access. Loads a single trade with its owning
// account and the rule evaluations produced for it (with rule name via include),
// scoped to the requesting user so one trader can never read another's journal.

import "server-only";
import { prisma } from "@/lib/db";
import { mapTrade } from "@/lib/data";
import type { TradeRecord, EvalStatus, Severity } from "@/lib/types";

export interface TradeEvaluation {
  id: string;
  ruleId: string;
  ruleName: string;
  status: EvalStatus;
  severity: Severity;
  explanation: string;
}

export interface TradeDetail {
  trade: TradeRecord;
  account: {
    id: string;
    name: string;
    kind: string;
    broker: string;
    currency: string;
    startingBalance: number;
  } | null;
  evaluations: TradeEvaluation[];
}

/**
 * Load a trade the user owns, its account, and its rule evaluations.
 * Returns `null` when the trade does not exist or is not owned by `userId`.
 */
export async function getTradeDetail(
  userId: string,
  tradeId: string
): Promise<TradeDetail | null> {
  const row = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    include: {
      account: true,
      evaluations: {
        include: { rule: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) return null;

  const evaluations: TradeEvaluation[] = row.evaluations.map((e) => ({
    id: e.id,
    ruleId: e.ruleId,
    ruleName: e.rule?.name ?? "Rule",
    status: e.status as EvalStatus,
    severity: e.severity as Severity,
    explanation: e.explanation,
  }));

  const account = row.account
    ? {
        id: row.account.id,
        name: row.account.name,
        kind: row.account.kind,
        broker: row.account.broker,
        currency: row.account.currency,
        startingBalance: row.account.startingBalance,
      }
    : null;

  return { trade: mapTrade(row), account, evaluations };
}
