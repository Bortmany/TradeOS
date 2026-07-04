// NinjaTrader "Trade Performance" grid export adapter.
//
// Example header row this adapter was designed against:
//   Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Commission,Profit,Cum. net profit
//
// Distinctive columns are "Market pos." (Long/Short), "Cum. net profit", and the
// "Entry price"/"Exit price" pair. NinjaTrader already exports round-trip trades.

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

export const ninjatraderAdapter: BrokerAdapter = {
  key: "ninjatrader",
  label: "NinjaTrader",
  detect(headers) {
    return (
      headersInclude(headers, "market pos") ||
      headersInclude(headers, "cum. net profit") ||
      headersInclude(headers, "cum net profit") ||
      (hasHeader(headers, "instrument") && headersInclude(headers, "entry name"))
    );
  },
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const c = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      const exitTimeRaw = g("exit time");
      c.add(i + 2, {
        symbol: g("instrument", "symbol"),
        side: normalizeSide(g("market pos.", "market pos", "direction")),
        entryPrice: num(g("entry price")),
        exitPrice: num(g("exit price")),
        quantity: num(g("qty", "quantity")),
        entryTime: parseDateLoose(g("entry time")),
        exitTime: exitTimeRaw ? parseDateLoose(exitTimeRaw) : null,
        fees: num(g("commission", "fees")),
        pnl: num(g("profit", "pnl", "realized")),
        strategyTag: g("strategy") || null,
        externalId: g("trade number", "id") || null,
      });
    });

    return c.result();
  },
};

export default ninjatraderAdapter;
