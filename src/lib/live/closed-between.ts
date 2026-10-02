// TradeOS — did a position close (or shrink) between two live reads?
//
// When it did, its open profit or loss leaves the snapshot immediately, but the
// closed trade only reaches us with the broker's next fills. The poller uses this
// to (a) fetch the fills right away and (b) keep the loss that left counted until
// they land, so a warning never drops in between. Pure.

export interface PositionLite {
  contractId: string;
  side: string;
  size: number;
  openPnl: number | null;
}

const key = (p: { contractId: string; side: string }) => `${p.contractId}|${p.side}`;

/**
 * `left` is true when any previous position is gone or smaller now.
 * `loss` is the part of its open P&L that left (only ever <= 0: a vanished
 * profit is never counted, caution only goes one way). A position we could not
 * price contributes 0 (its loss is unknown) but still sets `left`.
 */
export function positionsLeft(
  prev: PositionLite[],
  next: PositionLite[]
): { left: boolean; loss: number } {
  const nowSize = new Map<string, number>();
  for (const p of next) nowSize.set(key(p), (nowSize.get(key(p)) ?? 0) + p.size);

  let left = false;
  let gone = 0;
  for (const p of prev) {
    const remaining = nowSize.get(key(p)) ?? 0;
    if (remaining >= p.size) {
      nowSize.set(key(p), remaining - p.size);
      continue;
    }
    left = true;
    nowSize.set(key(p), 0);
    if (p.openPnl != null && p.size > 0) {
      gone += p.openPnl * ((p.size - remaining) / p.size);
    }
  }
  return { left, loss: Math.round(Math.min(0, gone) * 100) / 100 };
}
