// TradeOS — the coaching desk's state in one object: switches, caps, saved
// preferences, newest note of each kind, open focus items. Never calls the model.

import { prisma } from "@/lib/db";
import { isDemoDesk } from "@/lib/demo-desk";
import { isPushConfigured } from "@/lib/push/config";
import { isEmailEnabled } from "@/lib/email";
import type { Plan } from "@/lib/types";
import { isCoachingEnabled } from "./index";
import { aiCacheHours, coachingDailyCapFor } from "./limits";
import { demoFocus, demoNotes } from "./demo";
import { toNoteDTO, type FocusDTO, type NoteDTO } from "./notes";
import { usedToday } from "./service";
import { FOCUS_AREAS, TONES, type CoachingTone, type FocusArea, type NoteKind } from "./types";

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
  preferences: { tone: CoachingTone; focusAreas: FocusArea[]; weekly: boolean; weeklyEmail: boolean };
  latest: { suggestions: NoteDTO | null; clusters: NoteDTO | null; weekly: NoteDTO | null };
  openFocus: FocusDTO[];
}

export function toFocusDTO(r: {
  id: string;
  text: string;
  status: string;
  noteId: string | null;
  noteKind: string;
  createdAt: Date;
  doneAt: Date | null;
}): FocusDTO {
  return {
    id: r.id,
    text: r.text,
    status: r.status === "done" || r.status === "dismissed" ? r.status : "open",
    noteId: r.noteId,
    noteKind: r.noteKind as NoteKind,
    createdAt: r.createdAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
  };
}

export function parseFocusAreas(raw: string | null | undefined): FocusArea[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? FOCUS_AREAS.filter((a) => v.includes(a)) : [];
  } catch {
    return [];
  }
}

export async function getCoachingStatus(user: {
  id: string;
  email: string;
  plan: string;
  billingStatus: string;
}): Promise<CoachingStatus> {
  const demo = isDemoDesk(user.email);
  const limit = coachingDailyCapFor(user.plan as Plan, user.billingStatus);
  const base = {
    switchedOn: isCoachingEnabled(),
    demo,
    plan: user.plan,
    limit,
    cacheHours: aiCacheHours(),
    emailConfigured: isEmailEnabled(),
    pushConfigured: isPushConfigured(),
  };

  if (demo) {
    const notes = demoNotes();
    const pick = (k: NoteKind) => notes.find((n) => n.kind === k) ?? null;
    return {
      ...base,
      userEnabled: true,
      usedToday: 0,
      remaining: limit,
      preferences: { tone: "gentle", focusAreas: [], weekly: true, weeklyEmail: true },
      latest: { suggestions: pick("suggestions"), clusters: pick("clusters"), weekly: pick("weekly") },
      openFocus: demoFocus().filter((f) => f.status === "open"),
    };
  }

  const newest = (kind: NoteKind) =>
    prisma.coachingNote.findFirst({
      where: { userId: user.id, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  const [prefs, used, suggestions, clusters, weekly, focus] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        coachingEnabled: true,
        coachingTone: true,
        coachingFocusAreas: true,
        coachingWeekly: true,
        coachingWeeklyEmail: true,
      },
    }),
    usedToday(user.id),
    newest("suggestions"),
    newest("clusters"),
    newest("weekly"),
    prisma.coachingFocus.findMany({
      where: { userId: user.id, status: "open" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    ...base,
    userEnabled: prefs?.coachingEnabled ?? true,
    usedToday: used,
    remaining: Math.max(0, limit - used),
    preferences: {
      tone: (TONES as readonly string[]).includes(prefs?.coachingTone ?? "") ? (prefs!.coachingTone as CoachingTone) : "gentle",
      focusAreas: parseFocusAreas(prefs?.coachingFocusAreas),
      weekly: prefs?.coachingWeekly ?? true,
      weeklyEmail: prefs?.coachingWeeklyEmail ?? true,
    },
    latest: {
      suggestions: suggestions ? toNoteDTO(suggestions) : null,
      clusters: clusters ? toNoteDTO(clusters) : null,
      weekly: weekly ? toNoteDTO(weekly) : null,
    },
    openFocus: focus.map(toFocusDTO),
  };
}
