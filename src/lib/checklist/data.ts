// Checklist data access. Every query is scoped to the signed-in user's id; a row
// that belongs to someone else is indistinguishable from a missing one.

import "server-only";
import { prisma } from "@/lib/db";
import {
  inSuggestionWindow,
  parseAnswers,
  SUGGESTION_WINDOW_MS,
  type ChecklistRunDTO,
  type ChecklistTemplateDTO,
} from "@/lib/checklist";

const templateInclude = {
  items: { orderBy: { order: "asc" as const }, select: { id: true, text: true } },
  ruleBook: { select: { name: true } },
};

type TemplateRow = {
  id: string;
  name: string;
  ruleBookId: string | null;
  isActive: boolean;
  order: number;
  items: Array<{ id: string; text: string }>;
  ruleBook: { name: string } | null;
};

function toTemplateDTO(t: TemplateRow): ChecklistTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    ruleBookId: t.ruleBookId,
    ruleBookName: t.ruleBook?.name ?? null,
    isActive: t.isActive,
    order: t.order,
    items: t.items,
  };
}

export async function listTemplates(userId: string): Promise<ChecklistTemplateDTO[]> {
  const rows = await prisma.checklistTemplate.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: templateInclude,
  });
  return rows.map(toTemplateDTO);
}

export async function getTemplate(userId: string, id: string): Promise<ChecklistTemplateDTO | null> {
  const row = await prisma.checklistTemplate.findFirst({
    where: { id, userId },
    include: templateInclude,
  });
  return row ? toTemplateDTO(row) : null;
}

const runInclude = {
  trade: { select: { symbol: true, side: true } },
};

type RunRow = {
  id: string;
  templateId: string | null;
  templateName: string;
  answers: string;
  checkedCount: number;
  totalCount: number;
  tradeId: string | null;
  createdAt: Date;
  trade: { symbol: string; side: string } | null;
};

export function toRunDTO(r: RunRow): ChecklistRunDTO {
  return {
    id: r.id,
    templateId: r.templateId,
    templateName: r.templateName,
    answers: parseAnswers(r.answers),
    checkedCount: r.checkedCount,
    totalCount: r.totalCount,
    tradeId: r.tradeId,
    tradeLabel: r.trade ? `${r.trade.symbol} ${r.trade.side}` : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRuns(
  userId: string,
  opts: { limit: number; offset: number; unlinked?: boolean }
): Promise<{ runs: ChecklistRunDTO[]; hasMore: boolean }> {
  const rows = await prisma.checklistRun.findMany({
    where: { userId, ...(opts.unlinked ? { tradeId: null } : {}) },
    orderBy: { createdAt: "desc" },
    skip: opts.offset,
    take: opts.limit + 1,
    include: runInclude,
  });
  return {
    runs: rows.slice(0, opts.limit).map(toRunDTO),
    hasMore: rows.length > opts.limit,
  };
}

export async function getRun(userId: string, id: string): Promise<ChecklistRunDTO | null> {
  const row = await prisma.checklistRun.findFirst({ where: { id, userId }, include: runInclude });
  return row ? toRunDTO(row) : null;
}

export async function getLastRun(userId: string): Promise<ChecklistRunDTO | null> {
  const row = await prisma.checklistRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: runInclude,
  });
  return row ? toRunDTO(row) : null;
}

/**
 * What the trade page needs: the run linked to this trade (if any) and, when
 * none is linked, the closest unlinked run saved up to 4 hours before entry.
 * Returns null when the trade is not the user's.
 */
export async function getTradeChecklistState(
  userId: string,
  tradeId: string
): Promise<{
  linked: ChecklistRunDTO | null;
  suggestion: ChecklistRunDTO | null;
  /** How many unlinked runs fall in the window (more than one offers "Choose another"). */
  suggestionCount: number;
  entryTime: string;
  hasTemplates: boolean;
} | null> {
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    select: { entryTime: true },
  });
  if (!trade) return null;

  const [linkedRow, templateCount] = await Promise.all([
    prisma.checklistRun.findFirst({ where: { userId, tradeId }, include: runInclude }),
    prisma.checklistTemplate.count({ where: { userId } }),
  ]);

  let suggestion: ChecklistRunDTO | null = null;
  let suggestionCount = 0;
  if (!linkedRow) {
    const from = new Date(trade.entryTime.getTime() - SUGGESTION_WINDOW_MS);
    suggestionCount = await prisma.checklistRun.count({
      where: { userId, tradeId: null, createdAt: { gte: from, lte: trade.entryTime } },
    });
    const candidate = await prisma.checklistRun.findFirst({
      where: { userId, tradeId: null, createdAt: { gte: from, lte: trade.entryTime } },
      orderBy: { createdAt: "desc" },
      include: runInclude,
    });
    if (candidate && inSuggestionWindow(candidate.createdAt, trade.entryTime)) {
      suggestion = toRunDTO(candidate);
    }
  }

  return {
    linked: linkedRow ? toRunDTO(linkedRow) : null,
    suggestion,
    suggestionCount,
    entryTime: trade.entryTime.toISOString(),
    hasTemplates: templateCount > 0,
  };
}

/** Which checklist to pre-pick: one tied to a rulebook that applies to this account. */
export async function rulebookIdsForAccount(userId: string, accountId: string | null): Promise<string[]> {
  if (!accountId) return [];
  const books = await prisma.ruleBook.findMany({
    where: { userId, isActive: true, scope: "account", scopeValue: accountId },
    select: { id: true },
  });
  return books.map((b) => b.id);
}
