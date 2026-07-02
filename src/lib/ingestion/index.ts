// Ingestion package barrel + orchestrator.
//
// Public surface:
//   - ADAPTERS: BrokerAdapter[]            (specific adapters first, generic last)
//   - detectAdapter(headers)               (best header-heuristic match, or null)
//   - ingestCsv(text, brokerKey?)          (parse → adapt → normalized trades)
//
// Design notes / assumptions:
//   * One CSV row == one round-trip trade. Nearly every journal-style broker
//     export emits completed trades with both an entry and an exit, so we do NOT
//     attempt to pair separate buy/sell fills. Rows without an exit are ingested
//     as OPEN trades (exitPrice/exitTime null, pnl 0).
//   * P&L from the source file is trusted when present; otherwise it is computed
//     from prices via the per-symbol point multiplier (see symbols.ts).

import type { Broker } from "@/lib/types";
import type { NormalizedTrade } from "@/lib/types";
import { parseCsv } from "@/lib/ingestion/csv";
import type { BrokerAdapter } from "@/lib/ingestion/adapters/generic";
import { genericAdapter } from "@/lib/ingestion/adapters/generic";
import { topstepxAdapter } from "@/lib/ingestion/adapters/topstepx";
import { tradovateAdapter } from "@/lib/ingestion/adapters/tradovate";
import { ninjatraderAdapter } from "@/lib/ingestion/adapters/ninjatrader";
import { rithmicAdapter } from "@/lib/ingestion/adapters/rithmic";
import { ibkrAdapter } from "@/lib/ingestion/adapters/ibkr";

export type { BrokerAdapter, ParseResult } from "@/lib/ingestion/adapters/generic";

// Order matters: the specific adapters are tried in order, and `generic` (whose
// detect() always returns true) is last so it only wins as a fallback.
export const ADAPTERS: BrokerAdapter[] = [
  topstepxAdapter,
  tradovateAdapter,
  ninjatraderAdapter,
  rithmicAdapter,
  ibkrAdapter,
  genericAdapter,
];

export function detectAdapter(headers: string[]): BrokerAdapter | null {
  for (const adapter of ADAPTERS) {
    if (adapter.detect(headers)) return adapter;
  }
  return null;
}

export interface IngestResult {
  broker: Broker;
  trades: NormalizedTrade[];
  skipped: number;
  errors: string[];
}

export function ingestCsv(text: string, brokerKey?: Broker): IngestResult {
  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    return { broker: brokerKey ?? "generic", trades: [], skipped: 0, errors: ["Empty or unparseable CSV."] };
  }

  // Explicit broker override wins; otherwise auto-detect; generic is the floor.
  let adapter: BrokerAdapter | undefined;
  if (brokerKey) {
    adapter = ADAPTERS.find((a) => a.key === brokerKey);
  }
  const chosen = adapter ?? detectAdapter(headers) ?? genericAdapter;

  const { trades, skipped, errors } = chosen.parse(headers, rows);
  return { broker: chosen.key, trades, skipped, errors };
}
