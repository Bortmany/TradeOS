// TradeOS — canned sample coaching notes for the demo desk. Nothing here calls
// the model or touches the database; the GET routes serve these with a "Sample" badge.

import type { NoteDTO, FocusDTO } from "./notes";
import type { NoteKind } from "./types";

const AT = "2026-10-12T12:00:00.000Z";

function sample(kind: NoteKind, subjectKey: string, content: Record<string, unknown>): NoteDTO {
  return { id: `demo-${kind}`, kind, subjectKey, content, source: "demo", feedback: null, createdAt: AT };
}

export function demoNotes(): NoteDTO[] {
  return [
    sample("suggestions", "30d", {
      items: [
        {
          title: "Pause after a loss",
          body: "Take two minutes away from the screen after a losing trade before you look for the next one.",
          priority: "high",
        },
        {
          title: "Keep your size steady",
          body: "Stick to the size your rules allow, even when the last trade went well.",
          priority: "medium",
        },
        {
          title: "Journal the same day",
          body: "A one-line note while the trade is fresh makes your weekly review far more useful.",
          priority: "low",
        },
      ],
    }),
    sample("clusters", "30d", {
      items: [
        {
          label: "Trading past your daily stop",
          count: 4,
          suggestion: "Set an alarm for your daily loss limit and close the platform when it rings.",
        },
        {
          label: "Oversized entries",
          count: 2,
          suggestion: "Decide your size before the market opens and write it on a sticky note.",
        },
      ],
    }),
    sample("day", "2026-10-09", {
      date: "2026-10-09",
      summary: "A mostly disciplined day with one rule slip late in the session.",
      wins: ["Stayed within your trade limit", "Wrote a note on every trade"],
      mistakes: ["One entry came after your usual cut-off time"],
      focusTomorrow: "Stop taking new entries after your cut-off time.",
    }),
    sample("trade", "demo-trade", {
      tradeId: "demo-trade",
      headline: "Followed your plan on size, broke the time rule",
      detail: "The size was within your limit. The entry came after your cut-off, which is the one thing to fix.",
    }),
    sample("weekly", "2026-10-05", {
      weekStart: "2026-10-05",
      summary: "Your discipline held up well this week, with most rule checks passing.",
      wins: ["Four of five days within your loss limit", "Journal filled in on most trades"],
      mistakes: ["Two late-session entries after your cut-off time"],
      focusNextWeek: "Close the platform at your cut-off time every day.",
      previousFocusVerdict: "You kept last week's focus on most days.",
    }),
  ];
}

export function demoFocus(): FocusDTO[] {
  return [
    {
      id: "demo-focus",
      text: "Stop taking new entries after your cut-off time.",
      status: "open",
      noteId: "demo-day",
      noteKind: "day",
      createdAt: AT,
      doneAt: null,
    },
  ];
}
