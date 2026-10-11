// TradeOS — the shape an alert takes on its way to the screen: the stored row
// plus its parsed meta (value, step, "as at"), plus whether its account's live
// link is currently stale. Pure helpers; used by the dashboard page, GET
// /api/alerts and the tests. Dates are ISO strings so the same object can be
// serialized to the browser.

import type { AlertMeta, AlertMeasure } from "@/lib/alerts/generate";
import type { ConnectionLive, PositionView } from "@/lib/live/state";

export interface AlertRowLike {
  id: string;
  accountId: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
  meta: string | null;
  createdAt: Date;
}

export interface AlertView {
  id: string;
  accountId: string | null;
  accountName: string | null;
  type: string;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  /** null for hand-made alerts (no meta): shown as plain title and message. */
  measure: AlertMeasure | null;
  step: 50 | 80 | 100 | null;
  value: number | null;
  limit: number | null;
  left: number | null;
  usedPct: number | null;
  asAt: string;
  source: "live" | "closed";
  openCount: number;
  openEstimated: boolean;
  /** Loss (<= 0) of a position that just closed, still counted until its fills land. */
  pendingCloseLoss: number;
  unpricedCount: number;
  /** The account is live-linked but its last good read is old: "Can't refresh." */
  stale: boolean;
  createdAt: string;
}

function parse(raw: string | null): Partial<AlertMeta> {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? (m as Partial<AlertMeta>) : {};
  } catch {
    return {};
  }
}

const MEASURES: AlertMeasure[] = [
  "daily_loss",
  "drawdown",
  "profit_target",
  "overtrading",
  "rule_violation",
];

export function toAlertView(
  row: AlertRowLike,
  accountNames: Map<string, string>,
  connections: ConnectionLive[]
): AlertView {
  const m = parse(row.meta);
  const measure = MEASURES.includes(m.measure as AlertMeasure) ? (m.measure as AlertMeasure) : null;
  const conn = row.accountId ? connections.find((c) => c.accountId === row.accountId) : undefined;
  const stale = !!m.liveLinked && !!conn && (conn.health === "stale" || conn.health === "waiting");
  const step = m.step === 50 || m.step === 80 || m.step === 100 ? m.step : null;
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountId ? (accountNames.get(row.accountId) ?? null) : null,
    type: row.type,
    severity: row.severity === "high" || row.severity === "low" ? row.severity : "medium",
    title: row.title,
    message: row.message,
    measure,
    step,
    value: typeof m.value === "number" ? m.value : null,
    limit: typeof m.limit === "number" ? m.limit : null,
    left: typeof m.left === "number" ? m.left : null,
    usedPct: typeof m.usedPct === "number" ? m.usedPct : null,
    asAt: typeof m.asAt === "string" ? m.asAt : row.createdAt.toISOString(),
    source: m.source === "live" ? "live" : "closed",
    openCount: typeof m.openCount === "number" ? m.openCount : 0,
    openEstimated: !!m.openEstimated,
    pendingCloseLoss: typeof m.pendingCloseLoss === "number" ? m.pendingCloseLoss : 0,
    unpricedCount: typeof m.unpricedCount === "number" ? m.unpricedCount : 0,
    stale,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Highest step first (100, 80, 50), profit-target alerts last, then newest first. */
export function sortAlertViews(list: AlertView[]): AlertView[] {
  const rank = (a: AlertView) => (a.measure === "profit_target" ? 1 : 0);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const sa = a.step ?? 0;
    const sb = b.step ?? 0;
    if (sa !== sb) return sb - sa;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ── The payload of GET /api/alerts, and the live pieces of it ────────────────

export interface LiveAccountView {
  accountId: string;
  accountName: string;
  nearLive: boolean;
  health: ConnectionLive["health"];
  lastLiveAt: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
}

export interface PositionViewJson {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  avgPrice: number;
  lastPrice: number | null;
  priceSource: "broker" | "bar" | null;
  openPnl: number | null;
  notPricedReason: "no_point_value" | "no_price" | null;
  readAt: string;
}

export function toLiveAccountView(c: ConnectionLive): LiveAccountView {
  return {
    accountId: c.accountId,
    accountName: c.accountName,
    nearLive: c.nearLive,
    health: c.health,
    lastLiveAt: c.lastLiveAt ? c.lastLiveAt.toISOString() : null,
    lastError: c.lastError,
    lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
  };
}

export function toPositionJson(p: PositionView): PositionViewJson {
  return {
    id: p.id,
    accountId: p.accountId,
    accountName: p.accountName,
    symbol: p.symbol,
    side: p.side,
    size: p.size,
    avgPrice: p.avgPrice,
    lastPrice: p.lastPrice,
    priceSource: p.priceSource,
    openPnl: p.openPnl,
    notPricedReason: p.notPricedReason,
    readAt: p.readAt.toISOString(),
  };
}

export interface LiveSnapshot {
  alerts: AlertView[];
  accounts: LiveAccountView[];
  positions: PositionViewJson[];
  /** Server time of this snapshot (ISO). */
  now: string;
}
