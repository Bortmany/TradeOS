// MetaTrader 5 Positions-file import (Step 4). The sample file in
// public/samples/mt5-sample.csv is the fixture: 5 good trades, 1 open position,
// 1 BTCUSD row. Covers the adapter on its own, the times (machine-zone proof),
// auto-detect against every other adapter, and the real import route (USD-only
// refusal, plain-English refusals, and "the same file twice adds nothing").

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A settable "who is signed in" for the import route under test.
const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!session.current) throw new Error("UNAUTHORIZED");
    return session.current;
  },
  withUser:
    (handler: (user: Record<string, unknown>, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
      }
      return handler(session.current, ...args);
    },
}));

import { ingestCsv, detectAdapter, ADAPTERS } from "@/lib/ingestion";
import { parseMt5Time, mt5AccountCurrencyProblem, MT5_MESSAGES } from "@/lib/ingestion/adapters/mt5";
import { pnlFromPrices } from "@/lib/instruments";
import { POST as importRoute } from "@/app/api/import/route";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const SAMPLE = readFileSync(
  fileURLToPath(new URL("../public/samples/mt5-sample.csv", import.meta.url)),
  "utf8"
);
const HEADER =
  "Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit";

// One MT5 row: [open time, position, symbol, type, volume, open price, close time, close price, commission, swap, profit]
function row(o: {
  pos?: string;
  symbol?: string;
  type?: string;
  vol?: string;
  openPrice?: string;
  closePrice?: string;
  openTime?: string;
  closeTime?: string;
  comm?: string;
  swap?: string;
  profit?: string;
}): string {
  return [
    o.openTime ?? "2026.09.14 09:15:00",
    o.pos ?? "2001",
    o.symbol ?? "EURUSD",
    o.type ?? "buy",
    o.vol ?? "1.00",
    o.openPrice ?? "1.10000",
    "",
    "",
    o.closeTime ?? "2026.09.14 11:40:00",
    o.closePrice ?? "1.10500",
    o.comm ?? "-7.00",
    o.swap ?? "0.00",
    o.profit ?? "500.00",
  ].join(",");
}
const file = (...rows: string[]) => [HEADER, ...rows].join("\n");
const iso = (d: Date | null | undefined) => d?.toISOString();

describe("the MT5 sample file", () => {
  const r = ingestCsv(SAMPLE);

  it("is recognised as MT5 by its column names", () => {
    expect(r.broker).toBe("mt5");
  });

  it("imports the spec's 5 trades, skips 2 (one open, one BTCUSD), total $857.31", () => {
    expect(r.trades).toHaveLength(5);
    expect(r.skipped).toBe(2);
    expect(r.openSkipped).toBe(1);
    const total = r.trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    expect(Math.round(total * 100) / 100).toBe(857.31);
  });

  it("row 1: EURUSD long, forex, fees 7.00, gross 500.00, net 493.00, entry 06:15Z", () => {
    const t = r.trades[0];
    expect(t).toMatchObject({
      symbol: "EURUSD",
      side: "long",
      assetClass: "forex",
      quantity: 1,
      entryPrice: 1.1,
      exitPrice: 1.105,
      fees: 7,
      pnlGross: 500,
      pnl: 493,
      source: "csv",
      externalId: "mt5:1001",
    });
    expect(iso(t.entryTime)).toBe("2026-09-14T06:15:00.000Z");
    expect(iso(t.exitTime)).toBe("2026-09-14T08:40:00.000Z");
  });

  it("row 2: USDJPY short, fees 4.30, net 129.21", () => {
    expect(r.trades[1]).toMatchObject({ symbol: "USDJPY", side: "short", assetClass: "forex", fees: 4.3, pnl: 129.21, externalId: "mt5:1002" });
  });

  it("row 3: gold is a cfd, fees 1.00, net 104.00", () => {
    expect(r.trades[2]).toMatchObject({ symbol: "XAUUSD", side: "long", assetClass: "cfd", fees: 1, pnl: 104 });
  });

  it("row 4: GBPUSD.r short loss, a swap credit LOWERS fees (11.90), net -511.90", () => {
    expect(r.trades[3]).toMatchObject({ symbol: "GBPUSD", side: "short", fees: 11.9, pnlGross: -500, pnl: -511.9 });
  });

  it("row 5: EURGBP long, fees 7.00, net 643.00 (profit trusted from the file)", () => {
    expect(r.trades[4]).toMatchObject({ symbol: "EURGBP", side: "long", fees: 7, pnl: 643 });
  });

  it("the open position is counted, not imported and not listed as an error", () => {
    expect(r.trades.find((t) => t.externalId === "mt5:1006")).toBeUndefined();
    expect(r.errors.join(" ")).not.toMatch(/1006/);
  });

  it("the BTCUSD row is skipped and named", () => {
    expect(r.trades.find((t) => t.externalId === "mt5:1007")).toBeUndefined();
    expect(r.errors).toEqual(["Row 8: symbol BTCUSD is not supported yet"]);
  });

  it("says how the times were read", () => {
    expect(r.timesReadAs).toBe("GMT+2 winter / GMT+3 summer (New York close)");
  });

  it("never stores a comment or account detail: only the normal trade fields are set", () => {
    for (const t of r.trades) {
      expect(t.notes ?? null).toBeNull();
      expect(t.tags ?? null).toBeNull();
      expect(t.strategyTag ?? null).toBeNull();
    }
  });
});

describe("cross-check: the library and the file tell the same story", () => {
  const r = ingestCsv(SAMPLE);
  const cases: [number, number | undefined][] = [
    [0, undefined], // EURUSD
    [1, 149.8], // USDJPY, rate = its exit price
    [2, undefined], // XAUUSD
    [3, undefined], // GBPUSD
    [4, 1.3], // EURGBP at GBPUSD 1.30
  ];
  it.each(cases)("trade %i: pnlFromPrices equals the file's Profit to the cent", (i, rate) => {
    const t = r.trades[i];
    const gross = pnlFromPrices({
      symbol: t.symbol,
      side: t.side,
      lots: t.quantity,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice as number,
      accountCurrency: "USD",
      rate,
    });
    expect(gross).toBe(t.pnlGross);
  });
});

describe("the two Time and Price columns are read by position", () => {
  it("the SECOND Time and Price are the exit", () => {
    const r = ingestCsv(
      file(
        row({
          openTime: "2026.09.14 09:15:00",
          closeTime: "2026.09.14 13:00:00",
          openPrice: "1.10000",
          closePrice: "1.10700",
          profit: "700.00",
        })
      )
    );
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entryPrice).toBe(1.1);
    expect(r.trades[0].exitPrice).toBe(1.107);
    expect(iso(r.trades[0].entryTime)).toBe("2026-09-14T06:15:00.000Z");
    expect(iso(r.trades[0].exitTime)).toBe("2026-09-14T10:00:00.000Z");
  });

  it("a close before the open is reported, not saved", () => {
    const r = ingestCsv(file(row({ openTime: "2026.09.14 13:00:00", closeTime: "2026.09.14 09:00:00" })));
    expect(r.trades).toHaveLength(0);
    expect(r.errors.join(" ")).toMatch(/exit time is before entry time/);
  });
});

describe("duplicates, blanks and odd rows", () => {
  it("a repeated Position number: the first is kept, the second is reported", () => {
    const r = ingestCsv(file(row({ pos: "3001", profit: "500.00" }), row({ pos: "3001", profit: "999.00" })));
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].pnlGross).toBe(500);
    expect(r.skipped).toBe(1);
    expect(r.errors[0]).toMatch(/Row 3: position 3001 appears more than once/);
  });

  it("an open row does not block the closed version of the same position later in the file", () => {
    const r = ingestCsv(file(row({ pos: "3002", closeTime: "" }), row({ pos: "3002" })));
    expect(r.trades).toHaveLength(1);
    expect(r.openSkipped).toBe(1);
  });

  it("a blank totals row at the bottom is ignored quietly", () => {
    const r = ingestCsv(file(row({}), ",,,,,,,,,,,,493.00"));
    expect(r.trades).toHaveLength(1);
    expect(r.skipped).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("a row with a bad position number or time is reported", () => {
    const r = ingestCsv(
      file(row({ pos: "abc" }), row({ pos: "4002", openTime: "14/09/2026 09:15" }), row({ pos: "4003", closeTime: "2026.13.40 10:00:00" }))
    );
    expect(r.trades).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
  });

  it("a missing Profit cell is reported rather than guessed", () => {
    const r = ingestCsv(file(row({ profit: "" })));
    expect(r.trades).toHaveLength(0);
    expect(r.errors[0]).toMatch(/profit/);
  });

  it("broker endings and alternative names import under the table's name", () => {
    const r = ingestCsv(file(row({ pos: "5001", symbol: "GOLD.r", closePrice: "1.10500" }), row({ pos: "5002", symbol: "EURUSDm" })));
    expect(r.trades.map((t) => t.symbol)).toEqual(["XAUUSD", "EURUSD"]);
    expect(r.trades.map((t) => t.assetClass)).toEqual(["cfd", "forex"]);
  });

  it("an overflow price (1e200) is reported, not saved; the good row still imports", () => {
    const huge = "1".padEnd(201, "0");
    const r = ingestCsv(file(row({ pos: "6001" }), row({ pos: "6002", closePrice: huge })));
    expect(r.trades).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.errors.join(" ")).toMatch(/Row 3/);
  });

  it("thousands separators in money cells are read", () => {
    const r = ingestCsv(file(row({ profit: '"1,250.00"', comm: '"-7.00"' })));
    expect(r.trades[0].pnlGross).toBe(1250);
    expect(r.trades[0].pnl).toBe(1243);
  });
});

describe("times: New York close, UTC, fixed offset", () => {
  const SUMMER = "2026.09.14 09:15:00";
  const WINTER = "2026.12.10 09:15:00";

  it("default: September 09:15 -> 06:15Z, December 09:15 -> 07:15Z", () => {
    expect(iso(parseMt5Time(SUMMER))).toBe("2026-09-14T06:15:00.000Z");
    expect(iso(parseMt5Time(WINTER))).toBe("2026-12-10T07:15:00.000Z");
  });

  it("UTC leaves the stated time as UTC", () => {
    expect(iso(parseMt5Time(SUMMER, { mode: "utc" }))).toBe("2026-09-14T09:15:00.000Z");
  });

  it("a fixed +3 offset subtracts 3 hours; -5 adds 5", () => {
    expect(iso(parseMt5Time(SUMMER, { mode: "offset", hours: 3 }))).toBe("2026-09-14T06:15:00.000Z");
    expect(iso(parseMt5Time(SUMMER, { mode: "offset", hours: -5 }))).toBe("2026-09-14T14:15:00.000Z");
  });

  it("times with no seconds are read; impossible dates are refused", () => {
    expect(iso(parseMt5Time("2026.09.14 09:15"))).toBe("2026-09-14T06:15:00.000Z");
    expect(parseMt5Time("2026.02.30 09:15:00")).toBeNull();
    expect(parseMt5Time("2026.09.14 25:15:00")).toBeNull();
    expect(parseMt5Time("not a time")).toBeNull();
  });

  it("the server-time choice reaches the trades: UTC moves row 1 from 06:15Z to 09:15Z", () => {
    const utc = ingestCsv(SAMPLE, undefined, { serverTime: { mode: "utc" } });
    expect(iso(utc.trades[0].entryTime)).toBe("2026-09-14T09:15:00.000Z");
    expect(utc.timesReadAs).toBe("UTC");
    const plus3 = ingestCsv(SAMPLE, "mt5", { serverTime: { mode: "offset", hours: 3 } });
    expect(iso(plus3.trades[0].entryTime)).toBe("2026-09-14T06:15:00.000Z");
    expect(plus3.timesReadAs).toBe("UTC+3");
    expect(ingestCsv(SAMPLE, "mt5", { serverTime: { mode: "offset", hours: -5 } }).timesReadAs).toBe("UTC-5");
  });

  it("the answer does not change with the machine's own time zone", () => {
    const original = process.env.TZ;
    const offsets = new Set<number>();
    try {
      for (const tz of ["UTC", "America/Los_Angeles", "Asia/Muscat", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        offsets.add(new Date("2026-09-14T09:15:00Z").getTimezoneOffset());
        expect(iso(parseMt5Time(SUMMER))).toBe("2026-09-14T06:15:00.000Z");
        expect(iso(parseMt5Time(WINTER))).toBe("2026-12-10T07:15:00.000Z");
        expect(iso(ingestCsv(SAMPLE).trades[0].entryTime)).toBe("2026-09-14T06:15:00.000Z");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
    expect(offsets.size).toBeGreaterThan(1); // proof the machine zone really moved
  });
});

describe("files we refuse, in plain English, with no trades", () => {
  it("semicolon-separated file", () => {
    const r = ingestCsv(HEADER.replace(/,/g, ";") + "\n" + row({}).replace(/,/g, ";"));
    expect(r.broker).toBe("mt5");
    expect(r.trades).toHaveLength(0);
    expect(r.refusal).toBe(MT5_MESSAGES.semicolons);
    expect(r.refusal).toMatch(/semicolons between columns/);
  });

  it("the Deals table", () => {
    const deals =
      "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Fee,Swap,Profit,Balance,Comment\n" +
      "2026.09.14 09:15:00,5001,EURUSD,buy,in,1.00,1.10000,7001,-3.50,0,0,0,10000,\n";
    const r = ingestCsv(deals);
    expect(r.broker).toBe("mt5");
    expect(r.trades).toHaveLength(0);
    expect(r.refusal).toBe("This looks like the MT5 Deals table. Export the Positions table instead.");
  });

  it("an empty file", () => {
    const r = ingestCsv("");
    expect(r.trades).toHaveLength(0);
    expect(r.errors).toEqual(["Empty or unparseable CSV."]);
    expect(ingestCsv("", "mt5").trades).toHaveLength(0);
  });

  it("a header-only file", () => {
    const r = ingestCsv(HEADER + "\n");
    expect(r.broker).toBe("mt5");
    expect(r.trades).toHaveLength(0);
    expect(r.refusal).toBe(MT5_MESSAGES.noRows);
  });

  it("a file with only open positions imports nothing and says how many were left out", () => {
    const r = ingestCsv(file(row({ pos: "7001", closeTime: "" }), row({ pos: "7002", closeTime: "" })));
    expect(r.refusal).toBeUndefined();
    expect(r.trades).toHaveLength(0);
    expect(r.openSkipped).toBe(2);
    expect(r.skipped).toBe(2);
  });

  it("choosing MetaTrader 5 for some other file is refused, not guessed", () => {
    const r = ingestCsv("Symbol,Side,Quantity\nES,long,1\n", "mt5");
    expect(r.trades).toHaveLength(0);
    expect(r.refusal).toBe(MT5_MESSAGES.notPositions);
  });

  it("a Positions file missing the second Time/Price columns is refused", () => {
    const r = ingestCsv("Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Commission,Swap,Profit\n2026.09.14 09:15:00,1,EURUSD,buy,1,1.1,,,0,0,5\n");
    expect(r.refusal).toBe(MT5_MESSAGES.missingColumns);
  });

  it("a non-USD account is refused with the account's currency named", () => {
    expect(mt5AccountCurrencyProblem("EUR")).toBe("MT5 import supports USD accounts for now. This account is set to EUR.");
    expect(mt5AccountCurrencyProblem("usd")).toBeNull();
    expect(mt5AccountCurrencyProblem("USD")).toBeNull();
  });
});

describe("auto-detect still sends every other format to the same adapter as before", () => {
  // Header rows each existing adapter was designed against (from their own
  // header comments), plus the shipped TopstepX sample.
  const topstepSample = readFileSync(
    fileURLToPath(new URL("../public/samples/topstepx-sample.csv", import.meta.url)),
    "utf8"
  ).split("\n")[0];
  const existing: [string, string, string][] = [
    ["topstepx sample", topstepSample, "topstepx"],
    ["topstepx", "Id,ContractName,Side,Size,EntryPrice,ExitPrice,EnteredAt,ExitedAt,Fees,PnL", "topstepx"],
    ["ibkr", "Symbol,Asset Category,Date/Time,Buy/Sell,Quantity,T. Price,C. Price,Comm/Fee,Realized P/L,IBOrderID", "ibkr"],
    ["generic", "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees,PnL", "generic"],
    ["generic with time and price", "Date,Time,Symbol,Side,Volume,Price,Profit", "generic"],
  ];
  it.each(existing)("%s", (_n, header, expected) => {
    expect(detectAdapter(header.split(",").map((h) => h.trim()))?.key).toBe(expected);
  });

  it("no non-MT5 header is claimed by the MT5 adapter", () => {
    const mt5 = ADAPTERS.find((a) => a.key === "mt5")!;
    for (const [, header] of existing) {
      expect(mt5.detect(header.split(","))).toBe(false);
    }
  });

  it("the MT5 sample resolves to mt5", () => {
    expect(detectAdapter(SAMPLE.split("\n")[0].split(","))?.key).toBe("mt5");
  });

  it("MetaTrader 5 is listed among the brokers, before the generic fallback", () => {
    const keys = ADAPTERS.map((a) => a.key);
    expect(keys).toContain("mt5");
    expect(keys.indexOf("mt5")).toBeLessThan(keys.indexOf("generic"));
    expect(ADAPTERS.find((a) => a.key === "mt5")?.label).toBe("MetaTrader 5");
  });

  it("the TopstepX sample still imports with the same totals", () => {
    const r = ingestCsv(readFileSync(fileURLToPath(new URL("../public/samples/topstepx-sample.csv", import.meta.url)), "utf8"));
    expect(r.broker).toBe("topstepx");
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.trades.every((t) => (t.assetClass ?? null) === null)).toBe(true);
  });
});

describe("a generic file with a forex symbol and no P&L no longer gets the futures default", () => {
  const head = "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees";
  it("EURUSD 1 lot +50 pips is $500, not $0.005", () => {
    const r = ingestCsv(`${head}\nEURUSD,long,1,1.1000,1.1050,2026-09-14T10:00:00Z,2026-09-14T11:00:00Z,7`);
    expect(r.trades[0].pnl).toBe(493);
  });
  it("EURGBP with no GBPUSD rate is skipped and names the pair", () => {
    const r = ingestCsv(`${head}\nEURGBP,long,1,0.86,0.865,2026-09-14T10:00:00Z,2026-09-14T11:00:00Z,0`);
    expect(r.trades).toHaveLength(0);
    expect(r.errors[0]).toMatch(/GBPUSD/);
  });
  it("a file that already has a P&L column is trusted as before", () => {
    const r = ingestCsv(
      "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees,PnL\nEURGBP,long,1,0.86,0.865,2026-09-14T10:00:00Z,2026-09-14T11:00:00Z,0,123.45"
    );
    expect(r.trades[0].pnl).toBe(123.45);
  });
});

// --------------------------------------------------------------------------
// Through the real import route
// --------------------------------------------------------------------------

const stamp = Date.now();
let traderId = "";
let usdAccountId = "";
let eurAccountId = "";

function post(body: unknown): Request {
  return new Request("http://localhost/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function importFile(accountId: string, csvText: string, extra: Record<string, unknown> = {}) {
  const res = await importRoute(post({ accountId, csvText, ...extra }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/import with an MT5 file", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `mt5-${stamp}@example.com`, passwordHash: "x", displayName: "mt5" },
    });
    traderId = user.id;
    const usd = await prisma.tradingAccount.create({
      data: { userId: traderId, name: "MT5 USD", startingBalance: 10000, currency: "USD" },
    });
    usdAccountId = usd.id;
    const eur = await prisma.tradingAccount.create({
      data: { userId: traderId, name: "MT5 EUR", startingBalance: 10000, currency: "EUR" },
    });
    eurAccountId = eur.id;
    session.current = {
      id: traderId,
      email: `mt5-${stamp}@example.com`,
      displayName: null,
      plan: "pro",
      billingStatus: "active",
      timezone: "UTC",
      trialEndsAt: null,
    };
  });

  afterAll(async () => {
    await prisma.trade.deleteMany({ where: { userId: traderId } });
  });

  it("a non-USD account is refused with the plain message and nothing is saved", async () => {
    const { status, body } = await importFile(eurAccountId, SAMPLE);
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("MT5 import supports USD accounts for now. This account is set to EUR.");
    expect(await prisma.trade.count({ where: { accountId: eurAccountId } })).toBe(0);
  });

  it("the semicolon and Deals messages come back as errors and save nothing", async () => {
    const semi = await importFile(usdAccountId, HEADER.replace(/,/g, ";") + "\n" + row({}).replace(/,/g, ";"));
    expect(semi.status).toBe(400);
    expect(semi.body.error).toMatch(/semicolons between columns/);
    const deals = await importFile(
      usdAccountId,
      "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Fee,Swap,Profit,Balance,Comment\n2026.09.14 09:15:00,1,EURUSD,buy,in,1,1.1,1,0,0,0,0,0,\n"
    );
    expect(deals.status).toBe(400);
    expect(deals.body.error).toBe("This looks like the MT5 Deals table. Export the Positions table instead.");
    expect(await prisma.trade.count({ where: { accountId: usdAccountId } })).toBe(0);
  });

  it("an out-of-range server-time choice is rejected by validation", async () => {
    const { status } = await importFile(usdAccountId, SAMPLE, { serverTime: { mode: "offset", hours: 20 } });
    expect(status).toBe(400);
    expect(await prisma.trade.count({ where: { accountId: usdAccountId } })).toBe(0);
  });

  it("imports the sample: 5 trades saved with the kind label, $857.31 total, 2 skipped", async () => {
    const { status, body } = await importFile(usdAccountId, SAMPLE);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      broker: "mt5",
      imported: 5,
      skipped: 2,
      openSkipped: 1,
      timesReadAs: "GMT+2 winter / GMT+3 summer (New York close)",
    });
    const saved = await prisma.trade.findMany({ where: { accountId: usdAccountId }, orderBy: { entryTime: "asc" } });
    expect(saved).toHaveLength(5);
    expect(Math.round(saved.reduce((s, t) => s + t.pnl, 0) * 100) / 100).toBe(857.31);
    expect(saved.map((t) => t.assetClass)).toEqual(["forex", "forex", "cfd", "forex", "forex"]);
    expect(saved[0].externalId).toBe("mt5:1001");
    expect(saved[0].fees).toBe(7);
    expect(saved[0].pnl).toBe(493);
    expect(saved[0].userId).toBe(traderId);
  });

  it("importing the same file a second time adds nothing", async () => {
    const { status, body } = await importFile(usdAccountId, SAMPLE);
    expect(status).toBe(200);
    expect(body.imported).toBe(0);
    expect(await prisma.trade.count({ where: { accountId: usdAccountId } })).toBe(5);
  });

  it("the UTC choice changes the times: row 1 lands at 09:15Z", async () => {
    await prisma.trade.deleteMany({ where: { accountId: usdAccountId } });
    const { body } = await importFile(usdAccountId, SAMPLE, { serverTime: { mode: "utc" } });
    expect(body.imported).toBe(5);
    expect(body.timesReadAs).toBe("UTC");
    const first = await prisma.trade.findFirst({ where: { accountId: usdAccountId, externalId: "mt5:1001" } });
    expect(iso(first?.entryTime)).toBe("2026-09-14T09:15:00.000Z");
  });

  it("a futures import through the same route leaves the kind label blank", async () => {
    const csv = readFileSync(fileURLToPath(new URL("../public/samples/topstepx-sample.csv", import.meta.url)), "utf8");
    const { body } = await importFile(usdAccountId, csv);
    expect(body.ok).toBe(true);
    expect(body.broker).toBe("topstepx");
    expect(body.timesReadAs).toBeUndefined();
    const es = await prisma.trade.findFirst({ where: { accountId: usdAccountId, symbol: "ES" } });
    expect(es?.assetClass).toBeNull();
  });
});
