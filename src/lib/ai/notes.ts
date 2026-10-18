// TradeOS — AI coaching note shapes: zod schemas per kind, DTOs, and the one
// place focus text is copied from a saved note (never user-typed).

import { z } from "zod";
import { NOTE_KINDS, FOCUS_AREAS, type NoteKind, type FocusArea } from "./types";

export { NOTE_KINDS, FOCUS_AREAS };
export type { NoteKind, FocusArea };

export const FOCUS_TEXT_MAX = 600;
export const MAX_OPEN_FOCUS = 20;
export const focusFullBody = {
  ok: false,
  code: "focus_full",
  error: `You have ${MAX_OPEN_FOCUS} open focus items. Mark one done or dismiss it first.`,
} as const;

const text = z.string().max(600);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const suggestionsContentSchema = z.object({
  items: z
    .array(z.object({ title: text, body: text, priority: z.enum(["low", "medium", "high"]) }))
    .min(1)
    .max(5),
});
export const clustersContentSchema = z.object({
  items: z.array(z.object({ label: text, count: z.number(), suggestion: text })).max(5),
});
export const dayContentSchema = z.object({
  date: dayKey,
  summary: text,
  wins: z.array(text).max(5),
  mistakes: z.array(text).max(5),
  focusTomorrow: text,
});
export const tradeContentSchema = z.object({ tradeId: z.string().min(1), headline: text, detail: text });
export const weeklyContentSchema = z.object({
  weekStart: dayKey,
  summary: text,
  wins: z.array(text).max(5),
  mistakes: z.array(text).max(5),
  focusNextWeek: text,
  previousFocusVerdict: text.nullable(),
});

export const noteContentSchemas = {
  suggestions: suggestionsContentSchema,
  clusters: clustersContentSchema,
  day: dayContentSchema,
  trade: tradeContentSchema,
  weekly: weeklyContentSchema,
} as const satisfies Record<NoteKind, z.ZodTypeAny>;

export type SuggestionsContent = z.infer<typeof suggestionsContentSchema>;
export type ClustersContent = z.infer<typeof clustersContentSchema>;
export type DayContent = z.infer<typeof dayContentSchema>;
export type TradeContent = z.infer<typeof tradeContentSchema>;
export type WeeklyContent = z.infer<typeof weeklyContentSchema>;
export type NoteContent = SuggestionsContent | ClustersContent | DayContent | TradeContent | WeeklyContent;

export interface NoteDTO {
  id: string;
  kind: NoteKind;
  subjectKey: string;
  /** Parsed content; the shape depends on `kind` (see noteContentSchemas). */
  content: Record<string, unknown>;
  source: "ai" | "demo";
  feedback: "up" | "down" | null;
  createdAt: string; // ISO
}

export interface FocusDTO {
  id: string;
  text: string;
  status: "open" | "done" | "dismissed";
  noteId: string | null;
  noteKind: NoteKind;
  createdAt: string; // ISO
  doneAt: string | null; // ISO
}

interface NoteRowLike {
  id: string;
  kind: string;
  subjectKey: string;
  content: string;
  source: string;
  feedback: string | null;
  createdAt: Date;
}

function parseObject(raw: unknown): Record<string, unknown> {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function toNoteDTO(row: NoteRowLike): NoteDTO {
  return {
    id: row.id,
    kind: row.kind as NoteKind,
    subjectKey: row.subjectKey,
    content: parseObject(row.content),
    source: row.source === "demo" ? "demo" : "ai",
    feedback: row.feedback === "up" || row.feedback === "down" ? row.feedback : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const FOCUS_PATH_PATTERN = /^(focus|items\.\d+)$/;

/**
 * The text a trader gets when they turn a note into a focus item, copied from the
 * note itself. Returns null for a trade note or any kind/path pairing that
 * isn't allowed, so the route can answer 400.
 */
export function focusTextFromNote(content: unknown, kind: NoteKind, path: string): string | null {
  const raw = parseObject(content);
  if (kind === "day" && path === "focus") {
    const p = dayContentSchema.safeParse(raw);
    return p.success ? p.data.focusTomorrow.slice(0, FOCUS_TEXT_MAX) : null;
  }
  if (kind === "weekly" && path === "focus") {
    const p = weeklyContentSchema.safeParse(raw);
    return p.success ? p.data.focusNextWeek.slice(0, FOCUS_TEXT_MAX) : null;
  }
  const m = /^items\.(\d+)$/.exec(path);
  if (!m) return null;
  const i = Number(m[1]);
  if (kind === "suggestions") {
    const p = suggestionsContentSchema.safeParse(raw);
    const item = p.success ? p.data.items[i] : undefined;
    return item ? `${item.title} — ${item.body}`.slice(0, FOCUS_TEXT_MAX) : null;
  }
  if (kind === "clusters") {
    const p = clustersContentSchema.safeParse(raw);
    const item = p.success ? p.data.items[i] : undefined;
    return item ? item.suggestion.slice(0, FOCUS_TEXT_MAX) : null;
  }
  return null;
}
