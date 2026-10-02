// TradeOS — small, client-safe helpers for printing live figures and the
// "last updated" chip state. Pure: no database, no browser API.

import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import type { LiveAccountView } from "@/lib/alerts/view";

/** "2:14 PM ET" when the instant is today in the trader's zone, else "Oct 1, 2:14 PM ET". */
export function formatAsAt(value: string | Date, timeZone: string, now: Date = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return formatDate(d, timeZone) === formatDate(now, timeZone)
    ? formatTime(d, timeZone)
    : formatDateTime(d, timeZone);
}

/** Whole dollars for alert figures: "$820", "-$120". */
export function money(n: number): string {
  const rounded = Math.round(n);
  const body = Math.abs(rounded).toLocaleString("en-US");
  return `${rounded < 0 ? "-" : ""}$${body}`;
}

/** A price the way a platform shows it: "5,210.25". */
export function price(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export type ChipKind =
  | "live"
  | "stale"
  | "rejected"
  | "off"
  | "waiting";

export interface ChipState {
  kind: ChipKind;
  /** The time the chip quotes (oldest good read, or last 30-minute sync when off). */
  at: string | null;
  /** Names the account when more than one is linked and one is unreachable. */
  accountName: string | null;
}

/**
 * What the status chip says, from the freshness of the trader's near-live
 * accounts. null = no broker link at all (no chip). It quotes the OLDEST good
 * read, an honest "everything is at least this fresh".
 */
export function deriveChip(accounts: LiveAccountView[]): ChipState | null {
  if (accounts.length === 0) return null;
  const active = accounts.filter((a) => a.nearLive);
  if (active.length === 0) {
    const syncs = accounts.map((a) => a.lastSyncAt).filter((x): x is string => !!x).sort();
    return { kind: "off", at: syncs.length ? syncs[syncs.length - 1] : null, accountName: null };
  }
  const oldestRead = (list: LiveAccountView[]) =>
    list
      .map((a) => a.lastLiveAt)
      .filter((x): x is string => !!x)
      .sort()[0] ?? null;

  const rejected = active.find((a) => a.health === "rejected");
  if (rejected) {
    return { kind: "rejected", at: rejected.lastLiveAt, accountName: rejected.accountName };
  }
  const stale = active.filter((a) => a.health === "stale");
  if (stale.length) {
    const first = [...stale].sort((a, b) => (a.lastLiveAt ?? "").localeCompare(b.lastLiveAt ?? ""))[0];
    return {
      kind: "stale",
      at: first.lastLiveAt,
      accountName: accounts.length > 1 ? first.accountName : null,
    };
  }
  const live = active.filter((a) => a.health === "live");
  if (live.length === 0) return { kind: "waiting", at: null, accountName: null };
  return { kind: "live", at: oldestRead(live), accountName: null };
}
