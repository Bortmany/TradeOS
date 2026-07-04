// Interactive Brokers (IBKR) trades export adapter.
//
// Example header row this adapter was designed against:
//   Symbol,Asset Category,Date/Time,Buy/Sell,Quantity,T. Price,C. Price,Comm/Fee,Realized P/L,IBOrderID
//
// Distinctive columns are IBKR's "T. Price"/"C. Price", "Comm/Fee", and
// "IBOrderID"/"Asset Category". "T. Price" is the trade (entry) price and
// "C. Price" the closing (exit) price on a realized-trade row.

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

export const ibkrAdapter: BrokerAdapter = {
  key: "ibkr",
  label: "Interactive Brokers",
  detect(headers) {
    return (
      hasHeader(headers, "t. price") ||
      hasHeader(headers, "comm/fee") ||
      headersInclude(headers, "iborderid") ||
      headersInclude(headers, "asset category") ||
      hasHeader(headers, "conid")
    );
  },
  parse(headers, rows) {
    const idx = headerIndex(headers);
    const c = new TradeCollector();

    rows.forEach((row, i) => {
      const g = makeGetter(idx, row);
      c.add(i + 2, {
        symbol: g("symbol", "underlying symbol", "ticker"),
        side: normalizeSide(g("buy/sell", "side")),
        entryPrice: num(g("t. price", "trade price", "entry price")),
        exitPrice: num(g("c. price", "close price", "exit price")),
        quantity: num(g("quantity", "qty")),
        entryTime: parseDateLoose(g("date/time", "date", "entry time")),
        exitTime: parseDateLoose(g("close date/time", "exit time")),
        fees: num(g("comm/fee", "commission", "fees")),
        pnl: num(g("realized p/l", "realized pnl", "pnl")),
        externalId: g("iborderid", "order id", "id") || null,
      });
    });

    return c.result();
  },
};

export default ibkrAdapter;
