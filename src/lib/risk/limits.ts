// TradeOS — the ONE shared calculation of "today's loss" and "drawdown used".
//
// Both the alert generator (src/lib/alerts/generate.ts) and the Prop page
// (src/lib/prop.ts) call computeLimitFigures(), so the dashboard alert and the
// Prop-page buffer can never disagree (the September "finding 6" bug was two
// copies of this sum).
//
// Pure and Node-safe: no database, no server-only import. The day is midnight to
// midnight New York time (ET), for alerts and the Prop page alike.
//
// Open P&L (from the near-live read) is added to the daily loss and to the
// drawdown. The drawdown peak is the highest of: the closed-trade peak, the
// highest equity seen at any live read (open profit included), and the current
// equity. Profit-target progress ignores open P&L.

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-02": the New York calendar day of an instant. */
export function etDayKey(d: Date): string {
  return ET_DAY.format(d);
}

/** A live read counts as fresh for this long. Older than this, figures fall back to closed trades only. */
export const LIVE_FRESH_MS = 3 * 60_000;

export interface ClosedTradeLite {
  pnl: number;
  exitTime: Date;
}

/** What the latest near-live read says is open on an account. */
export interface OpenState {
  /** Sum of open P&L over the positions we could price. */
  openPnl: number;
  /** Positions currently open (priced or not). */
  openCount: number;
  /** Open positions we could not price (no point value, or no price). */
  unpricedCount: number;
  /** True when at least one priced position used the 1-minute bar estimate. */
  estimated: boolean;
  /**
   * Loss (< 0) of a position that just closed, already included in `openPnl`,
   * kept counted until the closed trade arrives from the broker's fills.
   */
  pendingCloseLoss?: number;
}

export interface LimitInput {
  startingBalance: number;
  /** Closed trades of ONE account (any order). */
  trades: ClosedTradeLite[];
  now: Date;
  /** The fresh open state, or null/undefined when there is none (closed trades only). */
  open?: OpenState | null;
  /** Highest equity seen at a live read (from BrokerConnection.livePeakEquity). */
  livePeakEquity?: number | null;
}

export interface LimitFigures {
  /** Closed profit since the start (never includes open P&L; the profit target uses this). */
  netProfit: number;
  /** Start + closed P&L + open P&L. */
  equity: number;
  /** Start + closed P&L only. */
  closedEquity: number;
  peak: number;
  currentDrawdown: number;
  /** Today's (ET) closed P&L. */
  todayClosedPnl: number;
  /** Open P&L included in the figures (0 when closed trades only). */
  openPnl: number;
  /** Today's closed P&L plus open P&L (signed). */
  todayPnl: number;
  /** Magnitude of today's loss, >= 0. */
  todayLoss: number;
  /** Closed P&L per ET day. */
  dayPnl: Map<string, number>;
  /** Number of closed trades exited today (ET). */
  todayTradeCount: number;
  includesOpen: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeLimitFigures(input: LimitInput): LimitFigures {
  const sorted = [...input.trades].sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());
  const base = input.startingBalance ?? 0;
  let equity = base;
  let peak = base;
  let netProfit = 0;
  const dayPnl = new Map<string, number>();
  const dayCount = new Map<string, number>();
  for (const t of sorted) {
    netProfit += t.pnl;
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const k = etDayKey(t.exitTime);
    dayPnl.set(k, (dayPnl.get(k) ?? 0) + t.pnl);
    dayCount.set(k, (dayCount.get(k) ?? 0) + 1);
  }
  const closedEquity = equity;
  const open = input.open ?? null;
  const openPnl = open ? open.openPnl : 0;
  const todayKey = etDayKey(input.now);
  const todayClosedPnl = dayPnl.get(todayKey) ?? 0;
  const todayPnl = todayClosedPnl + openPnl;

  const liveEquity = closedEquity + openPnl;
  let fullPeak = peak;
  if (input.livePeakEquity != null && input.livePeakEquity > fullPeak) fullPeak = input.livePeakEquity;
  if (liveEquity > fullPeak) fullPeak = liveEquity;

  return {
    netProfit: round2(netProfit),
    equity: round2(liveEquity),
    closedEquity: round2(closedEquity),
    peak: round2(fullPeak),
    currentDrawdown: round2(Math.max(0, fullPeak - liveEquity)),
    todayClosedPnl: round2(todayClosedPnl),
    openPnl: round2(openPnl),
    todayPnl: round2(todayPnl),
    todayLoss: round2(Math.max(0, -todayPnl)),
    dayPnl,
    todayTradeCount: dayCount.get(todayKey) ?? 0,
    includesOpen: open != null,
  };
}

// --------------------------------------------------------------------------
// The 50 / 80 / 100% steps, shared by the alert ladder and the Prop-page bars.
// --------------------------------------------------------------------------

export const STEP_HEADS_UP = 0.5;
export const STEP_WARNING = 0.8;
export const STEP_BREACH = 1;

export type Step = 0 | 50 | 80 | 100;

/** The highest step reached by a used/limit ratio (0 = below half). */
export function stepFor(used: number, limit: number): Step {
  if (!(limit > 0)) return 0;
  const r = used / limit;
  if (r >= STEP_BREACH) return 100;
  if (r >= STEP_WARNING) return 80;
  if (r >= STEP_HEADS_UP) return 50;
  return 0;
}

// --------------------------------------------------------------------------
// Open P&L from positions (pure).
// --------------------------------------------------------------------------

export interface PricedInput {
  side: "long" | "short";
  size: number;
  avgPrice: number;
  /** Price to value the position at; null when none could be found. */
  lastPrice: number | null;
  /** Dollar value of one point for this contract; null when unknown. */
  pointValue: number | null;
}

export type NotPricedReason = "no_point_value" | "no_price";

export interface PricedResult {
  openPnl: number | null;
  notPricedReason: NotPricedReason | null;
}

/**
 * Long = (last - average) x size x point value; short is the reverse. A
 * contract with no known point value, or no price, is NOT guessed: it returns
 * openPnl null and a reason, and is left out of totals.
 */
export function priceOpenPosition(p: PricedInput): PricedResult {
  if (p.pointValue == null) return { openPnl: null, notPricedReason: "no_point_value" };
  if (p.lastPrice == null || !Number.isFinite(p.lastPrice)) {
    return { openPnl: null, notPricedReason: "no_price" };
  }
  const diff = p.side === "long" ? p.lastPrice - p.avgPrice : p.avgPrice - p.lastPrice;
  return { openPnl: round2(diff * p.size * p.pointValue), notPricedReason: null };
}
