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
import { parseCsv, parseCsvRecords } from "@/lib/ingestion/csv";
import type { BrokerAdapter, ParseOptions } from "@/lib/ingestion/adapters/generic";
import { genericAdapter, looksLikeTradeTable } from "@/lib/ingestion/adapters/generic";
import { topstepxAdapter } from "@/lib/ingestion/adapters/topstepx";
import { tradovateAdapter } from "@/lib/ingestion/adapters/tradovate";
import { ninjatraderAdapter } from "@/lib/ingestion/adapters/ninjatrader";
import { rithmicAdapter } from "@/lib/ingestion/adapters/rithmic";
import { ibkrAdapter } from "@/lib/ingestion/adapters/ibkr";
import { mt5Adapter, findMt5Table } from "@/lib/ingestion/adapters/mt5";

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
  // True when the file has no recognisable trade table (not a broker CSV at all).
  // The import route answers with a plain error and creates no import record.
  notTradeFile?: boolean;
  // MT5 only.
  openSkipped?: number;
  timesReadAs?: string;
}

export function ingestCsv(text: string, brokerKey?: Broker, options?: ParseOptions): IngestResult {
  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    return {
      broker: brokerKey ?? "generic",
      trades: [],
      skipped: 0,
      errors: ["Empty or unparseable CSV."],
      notTradeFile: true,
    };
  }

  // Explicit broker override wins; otherwise auto-detect; generic is the floor.
  let adapter: BrokerAdapter | undefined;
  if (brokerKey) {
    adapter = ADAPTERS.find((a) => a.key === brokerKey);
  }
  let chosen = adapter ?? detectAdapter(headers) ?? genericAdapter;
  let useHeaders = headers;
  let useRows = rows;
  let useOptions = options;

  // A saved MT5 History report has title rows above the Positions table. Only when
  // MT5 was chosen, or auto-detect found nothing better than generic, and row 1 is
  // not already an MT5 header, look further down for the table. Other adapters
  // read their files exactly as before.
  if ((brokerKey === "mt5" || (!brokerKey && chosen.key === "generic")) && !mt5Adapter.detect(headers)) {
    const found = findMt5Table(parseCsvRecords(text));
    if (found?.kind === "refusal") {
      return { broker: "mt5", trades: [], skipped: 0, errors: [], refusal: found.refusal };
    }
    if (found) {
      chosen = mt5Adapter;
      useHeaders = found.headers;
      useRows = found.rows;
      useOptions = { ...options, firstDataRow: found.firstDataRow };
    }
  }

  const { trades, skipped, errors, refusal, openSkipped, timesReadAs } = chosen.parse(
    useHeaders,
    useRows,
    useOptions
  );
  return {
    broker: chosen.key,
    trades,
    skipped,
    errors,
    ...(refusal ? { refusal } : {}),
    ...(chosen.key === "generic" && !looksLikeTradeTable(useHeaders) ? { notTradeFile: true } : {}),
    ...(openSkipped !== undefined ? { openSkipped } : {}),
    ...(timesReadAs ? { timesReadAs } : {}),
  };
}
