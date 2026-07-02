// Rithmic (R Trader / RTrader Pro) trade export adapter.
//
// Example header row this adapter was designed against:
//   Account,Symbol,Exchange,Side,Qty,Entry Price,Exit Price,Entry Time,Exit Time,Commission,Net P&L,Order Number
//
// Distinctive columns are the "Exchange" field paired with an "Order Number"
// (or Rithmic's "Avg Fill Price"), which sets it apart from the other adapters.

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

export const rithmicAdapter: BrokerAdapter = {
  key: "rithmic",
  label: "Rithmic",
  detect(headers) {
    return (
      hasHeader(headers, "exchange") &&
      (headersInclude(headers, "order number") ||
        headersInclude(headers, "avg fill price") ||
        headersInclude(headers, "net p&l") ||
        headersInclude(headers, "account no"))
    );
  },
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const c = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      const exitTimeRaw = g("exit time");
      c.add(i + 2, {
        symbol: g("symbol", "instrument"),
        side: normalizeSide(g("side", "buy/sell", "b/s")),
        entryPrice: num(g("entry price", "avg fill price", "fill price")),
        exitPrice: num(g("exit price")),
        quantity: num(g("qty", "quantity", "size")),
        entryTime: parseDateLoose(g("entry time", "fill time")),
        exitTime: exitTimeRaw ? parseDateLoose(exitTimeRaw) : null,
        fees: num(g("commission", "fees")),
        pnl: num(g("net p&l", "net pnl", "pnl", "p&l")),
        externalId: g("order number", "order id", "id") || null,
      });
    });

    return c.result();
  },
};

export default rithmicAdapter;
