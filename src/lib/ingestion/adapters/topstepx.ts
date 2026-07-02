// TopstepX (ProjectX) trade-history adapter.
//
// Example header row this adapter was designed against:
//   Id,ContractName,Side,Size,EntryPrice,ExitPrice,EnteredAt,ExitedAt,Fees,PnL
//
// TopstepX exports one row per completed round-trip position. Distinctive
// columns are "ContractName" and the paired "EnteredAt"/"ExitedAt" timestamps.

import {
  type BrokerAdapter,
  TradeCollector,
  headerIndex,
  makeGetter,
  normalizeSide,
  num,
  parseDateLoose,
  hasHeader,
  headersInclude,
} from "@/lib/ingestion/adapters/generic";

export const topstepxAdapter: BrokerAdapter = {
  key: "topstepx",
  label: "TopstepX",
  detect(headers) {
    return (
      headersInclude(headers, "contractname") ||
      (hasHeader(headers, "enteredat") && hasHeader(headers, "exitedat"))
    );
  },
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const c = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      const exitTimeRaw = g("exitedat");
      c.add(i + 2, {
        symbol: g("contractname", "symbol"),
        side: normalizeSide(g("side", "type")),
        entryPrice: num(g("entryprice", "entry price")),
        exitPrice: num(g("exitprice", "exit price")),
        quantity: num(g("size", "qty", "quantity")),
        entryTime: parseDateLoose(g("enteredat", "entry time")),
        exitTime: exitTimeRaw ? parseDateLoose(exitTimeRaw) : null,
        fees: num(g("fees", "commission")),
        pnl: num(g("pnl", "p/l", "realized")),
        externalId: g("id", "tradeid") || null,
      });
    });

    return c.result();
  },
};

export default topstepxAdapter;
