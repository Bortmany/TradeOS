// TradeOS — the Testing Portal's standing disclaimer. Always rendered (never
// dismissible) under the page header on the portal and every results page, so
// no backtest number is ever read as a promise of future returns.

import { Info } from "lucide-react";

export const SIMULATED_DISCLAIMER = "Simulated on past data. Not a prediction of future results.";

export function SimulatedDisclaimer() {
  return (
    <p
      role="note"
      className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-muted-foreground"
    >
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      {SIMULATED_DISCLAIMER}
    </p>
  );
}
