// TradeOS — what changed between two polls of /api/alerts, in plain English, so
// the dashboard can tell a screen reader "New warning ..." and show the
// "Back under 80% ..." line when a warning clears by itself. Pure.

import type { AlertView } from "@/lib/alerts/view";
import { money } from "@/lib/live/format";

const MEASURE_LABEL: Record<string, string> = {
  daily_loss: "daily loss",
  drawdown: "drawdown",
  profit_target: "profit target",
  overtrading: "overtrading",
  rule_violation: "rule breaks",
};

/** One alert per account per measure: this is its identity on screen. */
export function alertKey(a: AlertView): string {
  return `${a.accountId ?? "user"}:${a.measure ?? a.id}`;
}

function label(a: AlertView): string {
  const who = a.accountName ? `${a.accountName} ` : "";
  return `${who}${a.measure ? MEASURE_LABEL[a.measure] : "alert"}`;
}

export interface AlertChanges {
  /** Spoken (polite live region) when something appeared or stepped up. */
  announcements: string[];
  /** Shown for a few seconds when a warning went away by itself. */
  cleared: string[];
}

export function diffAlerts(
  prev: AlertView[],
  next: AlertView[],
  /** Alert ids this browser just dismissed itself: not "cleared". */
  dismissedHere: ReadonlySet<string> = new Set()
): AlertChanges {
  const before = new Map(prev.map((a) => [alertKey(a), a]));
  const after = new Map(next.map((a) => [alertKey(a), a]));
  const announcements: string[] = [];
  const cleared: string[] = [];

  for (const [key, a] of after) {
    const old = before.get(key);
    const stepped = a.step != null && a.usedPct != null;
    const tail = stepped && a.left != null ? `, ${a.step}% used, ${money(a.left)} left.` : ".";
    if (!old) {
      announcements.push(
        a.measure
          ? `New warning: ${label(a)}${tail}`
          : `New warning: ${a.title}.`
      );
    } else if (old.step !== a.step && a.step != null) {
      announcements.push(`${label(a)} is now ${a.step}% used${a.left != null ? `, ${money(a.left)} left` : ""}.`);
    }
  }
  for (const [key, old] of before) {
    if (after.has(key) || dismissedHere.has(old.id)) continue;
    cleared.push(
      old.step != null
        ? `Back under ${old.step}%. ${label(old)} warning cleared.`
        : `${label(old)} warning cleared.`
    );
  }
  return { announcements, cleared };
}
