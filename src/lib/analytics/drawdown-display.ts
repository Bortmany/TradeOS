// TradeOS — how the dashboard's Max Drawdown tile reads.
//
// Display only: the stored numbers (maxDrawdown, maxDrawdownPct) are untouched.
//
// maxDrawdownPct is "the biggest fall as a share of the best profit at that
// moment". That share is only a sensible thing to print while the fall stayed
// within that profit (0-100%). When the best profit so far was tiny, or never
// above zero, the share runs to hundreds of percent ("921.8% of peak profit"),
// which tells the trader nothing, so the tile shows the dollar fall instead.

import { formatCurrency, formatPercent } from "@/lib/utils";

export interface DrawdownTile {
  /** The big number. */
  value: string;
  /** The small line under it. */
  hint: string;
}

export function drawdownTile(maxDrawdown: number, maxDrawdownPct: number): DrawdownTile {
  const dollars = formatCurrency(-Math.abs(maxDrawdown));
  if (!(maxDrawdown > 0)) {
    return { value: formatCurrency(0), hint: "No fall from your best profit yet" };
  }
  if (Number.isFinite(maxDrawdownPct) && maxDrawdownPct > 0 && maxDrawdownPct <= 1) {
    return { value: formatPercent(maxDrawdownPct), hint: `of peak profit · ${dollars}` };
  }
  return { value: dollars, hint: "biggest fall from your best profit" };
}
