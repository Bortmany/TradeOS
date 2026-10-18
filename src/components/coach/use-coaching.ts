"use client";

// Client helpers for the AI coach: thin fetch wrappers over /api/coaching/*.
// Nothing here calls the model except generateNote, which only runs on a
// button press. Types come from the server module as type-only imports.

import type { NoteDTO, FocusDTO, NoteKind } from "@/lib/ai/notes";

export const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

const CODE_COPY: Record<string, string> = {
  limit: "You've reached today's AI coaching limit. It resets within 24 hours.",
  global_limit: "AI coaching is very busy today and has paused until tomorrow.",
  unavailable: "Coaching isn't available right now.",
  no_data: "Add a few more trades and your coach will have something to read.",
  week_open: "That week isn't finished yet. Pick a week that has ended.",
  user_off: "You've turned the AI coach off. Switch it back on in Settings.",
  disabled: "AI coaching isn't switched on for this site yet.",
  plan: "AI coaching isn't included in your current plan.",
  demo: DEMO_LINE,
  not_found: "We couldn't find that. It may have been deleted.",
  focus_full: "You already have 20 open focus items. Finish or dismiss one first.",
};

export function coachingErrorText(code: string | undefined, fallback: string): string {
  return (code && CODE_COPY[code]) || fallback;
}

export interface CoachingStatus {
  switchedOn: boolean;
  userEnabled: boolean;
  demo: boolean;
  plan: string;
  limit: number;
  usedToday: number;
  remaining: number;
  cacheHours: number;
  emailConfigured: boolean;
  pushConfigured: boolean;
  preferences: { tone: string; focusAreas: string[]; weekly: boolean; weeklyEmail: boolean };
  latest: { suggestions: NoteDTO | null; clusters: NoteDTO | null; weekly: NoteDTO | null };
  openFocus: FocusDTO[];
}

type Fail = { ok: false; code?: string; error: string };

async function call<T extends object>(
  url: string,
  init: RequestInit | undefined,
  fallback: string
): Promise<({ ok: true } & T) | Fail> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.ok === false) {
      const code = typeof json.code === "string" ? json.code : undefined;
      const error = typeof json.error === "string" ? json.error : fallback;
      return { ok: false, code, error: coachingErrorText(code, error) };
    }
    return json as { ok: true } & T;
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export type GenerateResult =
  | { ok: true; note: NoteDTO; cached: boolean; usage: { used: number; limit: number } }
  | Fail;

export async function generateNote(req: {
  kind: NoteKind;
  tradeId?: string;
  date?: string;
  weekStart?: string;
}): Promise<GenerateResult> {
  const r = await call<{ note: NoteDTO; cached: boolean; usage: { used: number; limit: number } }>(
    "/api/coaching/notes",
    { method: "POST", body: JSON.stringify(req) },
    "Couldn't write that note. Please try again."
  );
  return r.ok ? { ok: true, note: r.note, cached: r.cached, usage: r.usage } : r;
}

export async function sendFeedback(
  noteId: string,
  vote: "up" | "down" | null
): Promise<{ ok: true } | Fail> {
  const r = await call<object>(
    `/api/coaching/notes/${encodeURIComponent(noteId)}/feedback`,
    { method: "POST", body: JSON.stringify({ vote }) },
    "Couldn't save that. Please try again."
  );
  return r.ok ? { ok: true } : r;
}

export async function deleteNote(noteId: string): Promise<{ ok: true } | Fail> {
  const r = await call<object>(
    `/api/coaching/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
    "Couldn't delete that note. Please try again."
  );
  return r.ok ? { ok: true } : r;
}

export type MakeFocusResult =
  | {
      ok: true;
      item: FocusDTO;
      checklist?: { added: boolean; reason?: string };
      existing: boolean;
    }
  | Fail;

export async function makeFocus(
  noteId: string,
  path: string,
  addToChecklist?: boolean
): Promise<MakeFocusResult> {
  try {
    const res = await fetch("/api/coaching/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, path, ...(addToChecklist ? { addToChecklist: true } : {}) }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.ok === false) {
      const code = typeof json.code === "string" ? json.code : undefined;
      const error = typeof json.error === "string" ? json.error : "Couldn't add that. Please try again.";
      return { ok: false, code, error: coachingErrorText(code, error) };
    }
    return {
      ok: true,
      item: json.item as FocusDTO,
      checklist: json.checklist as { added: boolean; reason?: string } | undefined,
      existing: res.status === 200,
    };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export async function setFocusStatus(
  id: string,
  status: "open" | "done" | "dismissed"
): Promise<{ ok: true; item: FocusDTO } | Fail> {
  const r = await call<{ item: FocusDTO }>(
    `/api/coaching/focus/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    "Couldn't save that. Please try again."
  );
  return r.ok ? { ok: true, item: r.item } : r;
}

export async function fetchStatus(): Promise<CoachingStatus | null> {
  try {
    const res = await fetch("/api/coaching", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as (CoachingStatus & { ok?: boolean }) | null;
    if (!res.ok || !json || json.ok === false) return null;
    return json;
  } catch {
    return null;
  }
}

/** Saved notes only (no model call). */
export async function fetchNotes(params: {
  kind?: NoteKind;
  subject?: string;
  limit?: number;
}): Promise<NoteDTO[] | null> {
  const q = new URLSearchParams();
  if (params.kind) q.set("kind", params.kind);
  if (params.subject) q.set("subject", params.subject);
  if (params.limit) q.set("limit", String(params.limit));
  try {
    const res = await fetch(`/api/coaching/notes?${q.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; notes?: NoteDTO[] } | null;
    if (!res.ok || !json || json.ok === false || !Array.isArray(json.notes)) return null;
    return json.notes;
  } catch {
    return null;
  }
}
