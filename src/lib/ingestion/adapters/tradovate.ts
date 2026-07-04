// Tradovate performance/trade export adapter.
//
// Example header row this adapter was designed against:
//   Order ID,Symbol,Product,B/S,Qty,Buy Price,Sell Price,Bought Timestamp,Sold Timestamp,Commission,Realized P/L
//
// Distinctive columns are the "B/S" side field and the "Bought/Sold Timestamp"
// pair. For a round-trip row we derive entry/exit from B/S: a "Buy" position
// enters at Buy Price and exits at Sell Price (and vice-versa for a "Sell").

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

export const tradovateAdapter: BrokerAdapter = {
  key: "tradovate",
  label: "Tradovate",
  detect(headers) {
    return (
      (hasHeader(headers, "b/s") &&
        (headersInclude(headers, "product") ||
          headersInclude(headers, "timestamp"))) ||
      headersInclude(headers, "bought timestamp")
    );
  },
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const c = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      const side = normalizeSide(g("b/s", "side", "buy/sell"));
      const buyPrice = num(g("buy price", "bought price"));
      const sellPrice = num(g("sell price", "sold price"));
      const boughtAt = g("bought timestamp", "buy time");
      const soldAt = g("sold timestamp", "sell time");

      // Map buy/sell legs onto entry/exit based on position direction.
      const isLong = side === "long";
      const entryPrice = isLong ? buyPrice : sellPrice;
      const exitPrice = isLong ? sellPrice : buyPrice;
      const entryTimeRaw = isLong ? boughtAt : soldAt;
      const exitTimeRaw = isLong ? soldAt : boughtAt;

      c.add(i + 2, {
        symbol: g("symbol", "product", "contract"),
        side,
        entryPrice,
        exitPrice,
        quantity: num(g("qty", "quantity", "size")),
        entryTime: parseDateLoose(entryTimeRaw),
        exitTime: exitTimeRaw ? parseDateLoose(exitTimeRaw) : null,
        fees: num(g("commission", "fees", "comm")),
        pnl: num(g("realized p/l", "pnl", "p/l", "net pnl")),
        externalId: g("order id", "orderid", "id") || null,
      });
    });

    return c.result();
  },
};

export default tradovateAdapter;
