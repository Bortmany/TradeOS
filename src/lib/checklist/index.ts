// Pre-trade checklist: shared constants, zod schemas and pure helpers.
//
// A checklist only reminds. Nothing here blocks a trade, and nothing here is
// read by the rule engine or the discipline score. No broker, no orders.

import { z } from "zod";

export const MAX_TEMPLATES_PER_USER = 10;
export const MAX_ITEMS_PER_TEMPLATE = 20;
export const MAX_ITEM_LENGTH = 140;
export const MAX_NAME_LENGTH = 60;
export const MAX_RUNS_PER_USER = 5000;
/** A saved run is offered for a trade it was saved up to this long before entry. */
export const SUGGESTION_WINDOW_MS = 4 * 60 * 60 * 1000;

export const STARTER_NAME = "Starter checklist";
export const STARTER_ITEMS: readonly string[] = [
  "Is this a setup from my plan?",
  "Do I know exactly where my stop goes?",
  "Is my size inside my limit?",
  "Am I calm, not chasing or trying to win back a loss?",
  "Would I take this trade if my last one had been a winner?",
];

const itemText = z.string().trim().min(1).max(MAX_ITEM_LENGTH);
const idSchema = z.string().min(1).max(64);

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  ruleBookId: idSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  items: z.array(itemText).min(1).max(MAX_ITEMS_PER_TEMPLATE),
});

export const templatePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    ruleBookId: idSchema.optional().nullable(),
    isActive: z.boolean().optional(),
    items: z.array(itemText).min(1).max(MAX_ITEMS_PER_TEMPLATE).optional(),
    move: z.enum(["up", "down"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nothing to change." });

export const runCreateSchema = z.object({
  templateId: idSchema,
  // Ids of the checklist items that were ticked.
  ticked: z.array(idSchema).max(MAX_ITEMS_PER_TEMPLATE),
  // Optional: link the new run to this trade straight away ("Fill one in now").
  tradeId: idSchema.optional().nullable(),
});

export const runPatchSchema = z.object({
  // A trade id links the run; null unlinks it.
  tradeId: idSchema.nullable(),
});

export const runListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  unlinked: z.enum(["1", "0"]).optional(),
});

export const suggestionQuerySchema = z.object({ tradeId: idSchema });

export interface RunAnswer {
  text: string;
  checked: boolean;
}

/** Each run keeps its own copy of the wording, so later edits never change history. */
export function buildAnswers(
  items: ReadonlyArray<{ id: string; text: string }>,
  tickedIds: ReadonlyArray<string>
): { answers: RunAnswer[]; checkedCount: number; totalCount: number } {
  const ticked = new Set(tickedIds);
  const answers = items.map((i) => ({ text: i.text, checked: ticked.has(i.id) }));
  return {
    answers,
    checkedCount: answers.filter((a) => a.checked).length,
    totalCount: answers.length,
  };
}

/** Read the stored answers back. Bad or old data gives an empty list, never a crash. */
export function parseAnswers(raw: string): RunAnswer[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RunAnswer[] = [];
    for (const a of parsed) {
      if (a && typeof a === "object" && typeof (a as RunAnswer).text === "string") {
        out.push({ text: (a as RunAnswer).text, checked: (a as RunAnswer).checked === true });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Was the run saved at or before the trade's entry? Drives the honest badge. */
export function tickedBeforeEntry(runSavedAt: Date | string, entryTime: Date | string): boolean {
  return new Date(runSavedAt).getTime() <= new Date(entryTime).getTime();
}

/** True when a run saved at `savedAt` may be suggested for a trade entered at `entryTime`. */
export function inSuggestionWindow(savedAt: Date | string, entryTime: Date | string): boolean {
  const gap = new Date(entryTime).getTime() - new Date(savedAt).getTime();
  return gap >= 0 && gap <= SUGGESTION_WINDOW_MS;
}

/** "Just before this entry", "12 minutes", "1 hour 5 minutes". */
export function minutesBeforePhrase(savedAt: Date | string, entryTime: Date | string): string {
  const gap = new Date(entryTime).getTime() - new Date(savedAt).getTime();
  const minutes = Math.floor(Math.max(0, gap) / 60000);
  if (minutes < 1) return "just before this entry";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (h === 0) return `${plural(m, "minute")} before this entry`;
  return `${plural(h, "hour")}${m ? ` ${plural(m, "minute")}` : ""} before this entry`;
}

/** "2 hours ago", "5 minutes ago", "just now" (for the Last run line). */
export function timeAgo(then: Date | string, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(then).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// --------------------------------------------------------------------------
// Shapes the routes return and the screens use
// --------------------------------------------------------------------------

export interface ChecklistTemplateDTO {
  id: string;
  name: string;
  ruleBookId: string | null;
  ruleBookName: string | null;
  isActive: boolean;
  order: number;
  items: Array<{ id: string; text: string }>;
}

export interface ChecklistRunDTO {
  id: string;
  templateId: string | null;
  templateName: string;
  answers: RunAnswer[];
  checkedCount: number;
  totalCount: number;
  tradeId: string | null;
  /** "MES long" when linked (for the Recent runs badge). */
  tradeLabel: string | null;
  createdAt: string;
}

/**
 * Demo desk: the demo user has no saved checklist, so screens show the built-in
 * five questions as a preview run. Nothing is created on the server.
 */
export const DEMO_STARTER_TEMPLATE: ChecklistTemplateDTO = {
  id: "demo-starter",
  name: STARTER_NAME,
  ruleBookId: null,
  ruleBookName: null,
  isActive: true,
  order: 0,
  items: STARTER_ITEMS.map((text, i) => ({ id: `demo-${i}`, text })),
};
