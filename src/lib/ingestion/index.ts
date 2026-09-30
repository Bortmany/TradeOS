// Ingestion package barrel + orchestrator.
//
// Public surface:
//   - ADAPTERS: BrokerAdapter[]            (specific adapters first, generic last)
//   - detectAdapter(headers)               (best header-heuristic match, or null)
//   - ingestCsv(text, brokerKey?, options?) (parse → adapt → normalized trades)
//
// Design notes / assumptions:
//   * One CSV row == one round-trip trade. Nearly every journal-style broker
//     export emits completed trades with both an entry and an exit, so we do NOT
//     attempt to pair separate buy/sell fills. Rows without an exit are ingested
//     as OPEN trades (exitPrice/exitTime null, pnl 0).
//   * P&L from the source file is trusted when present; otherwise it is computed
//     from prices: futures via the per-symbol point multiplier (see symbols.ts),
//     known forex/CFD symbols via src/lib/instruments/.

import type { Broker } from "@/lib/types";
import type { NormalizedTrade } from "@/lib/types";
import { parseCsv } from "@/lib/ingestion/csv";
import type { BrokerAdapter, ParseOptions } from "@/lib/ingestion/adapters/generic";
import { genericAdapter } from "@/lib/ingestion/adapters/generic";
import { topstepxAdapter } from "@/lib/ingestion/adapters/topstepx";
import { tradovateAdapter } from "@/lib/ingestion/adapters/tradovate";
import { ninjatraderAdapter } from "@/lib/ingestion/adapters/ninjatrader";
import { rithmicAdapter } from "@/lib/ingestion/adapters/rithmic";
import { ibkrAdapter } from "@/lib/ingestion/adapters/ibkr";
import { mt5Adapter } from "@/lib/ingestion/adapters/mt5";

export type { BrokerAdapter, ParseResult, ParseOptions } from "@/lib/ingestion/adapters/generic";

// Order matters: the specific adapters are tried in order, and `generic` (whose
// detect() always returns true) is last so it only wins as a fallback.
export const ADAPTERS: BrokerAdapter[] = [
  topstepxAdapter,
  tradovateAdapter,
  ninjatraderAdapter,
  rithmicAdapter,
  ibkrAdapter,
  mt5Adapter,
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
  // Set when the whole file was refused (nothing imported), in plain English.
  refusal?: string;
  // MT5 only.
  openSkipped?: number;
  timesReadAs?: string;
}

export function ingestCsv(text: string, brokerKey?: Broker, options?: ParseOptions): IngestResult {
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

  const { trades, skipped, errors, refusal, openSkipped, timesReadAs } = chosen.parse(
    headers,
    rows,
    options
  );
  return {
    broker: chosen.key,
    trades,
    skipped,
    errors,
    ...(refusal ? { refusal } : {}),
    ...(openSkipped !== undefined ? { openSkipped } : {}),
    ...(timesReadAs ? { timesReadAs } : {}),
  };
}
