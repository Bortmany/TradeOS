// FIFO pairing — the core-guarantee suite for src/lib/connectors/topstepx.ts.
//
// The first block ports, one-for-one, all 21 checks that used to live in the
// hand-run scripts/test-pairing.ts (nothing proven before is dropped). The
// blocks after it add the coverage that script was missing: out-of-order
// fills, a position scaled in across 3+ entries and out across 2+ exits, and
// the multi-account cross-pairing guard.

import { describe, it, expect } from "vitest";
import { pairFills, contractIdToSymbol, type ProjectXFill } from "@/lib/connectors/topstepx";

// Fill factory (accountId defaults to 1, overridable for the multi-account tests).
const f = (
  id: number,
  contractId: string,
  side: 0 | 1,
  size: number,
  price: number,
  t: string,
  fees = 0,
  pnl: number | null = null,
  accountId: number | string = 1
): ProjectXFill => ({
  id,
  accountId,
  contractId,
  creationTimestamp: t,
  price,
  profitAndLoss: pnl,
  fees,
  side,
  size,
});

const ES = "CON.F.US.EP.U25";
const NQ = "CON.F.US.ENQ.U25";
const MES = "CON.F.US.MES.U25";

// ===========================================================================
// Ported from scripts/test-pairing.ts — 21 checks, now real assertions.
// ===========================================================================

describe("symbol mapping", () => {
  it("EP -> ES", () => expect(contractIdToSymbol(ES)).toBe("ES"));
  it("ENQ -> NQ", () => expect(contractIdToSymbol(NQ)).toBe("NQ"));
  it("unknown root passes through", () =>
    expect(contractIdToSymbol("CON.F.US.ZB.U25")).toBe("ZB"));
});

describe("1. simple long win (2 ES, +2pts, $4 fees/side)", () => {
  const t = pairFills([
    f(1, ES, 0, 2, 5000, "2026-07-01T13:35:00Z", 4),
    f(2, ES, 1, 2, 5002, "2026-07-01T13:50:00Z", 4),
  ]);
  it("one round trip", () => expect(t.length).toBe(1));
  it("side long", () => expect(t[0]?.side).toBe("long"));
  it("gross 2pts x 2 x $50 = 200", () => expect(t[0]?.pnlGross).toBe(200));
  it("fees 8, net 192", () => {
    expect(t[0]?.fees).toBe(8);
    expect(t[0]?.pnl).toBe(192);
  });
  it("externalId from the closing fill", () => expect(t[0]?.externalId).toBe("px-2"));
});

describe("2. short win (1 NQ, -10pts)", () => {
  const t = pairFills([
    f(3, NQ, 1, 1, 18000, "2026-07-01T14:00:00Z", 2),
    f(4, NQ, 0, 1, 17990, "2026-07-01T14:20:00Z", 2),
  ]);
  it("side short, gross 10 x 20 = 200, net 196", () => {
    expect(t[0]?.side).toBe("short");
    expect(t[0]?.pnlGross).toBe(200);
    expect(t[0]?.pnl).toBe(196);
  });
});

describe("3. partial closes (buy 3 MES, sell 1, sell 2)", () => {
  const t = pairFills([
    f(5, MES, 0, 3, 5000, "2026-07-01T13:35:00Z", 3),
    f(6, MES, 1, 1, 5004, "2026-07-01T13:45:00Z", 1),
    f(7, MES, 1, 2, 4998, "2026-07-01T14:05:00Z", 2),
  ]);
  it("two round trips", () => expect(t.length).toBe(2));
  it("first: qty1 +4pts x $5 = 20 gross", () => {
    expect(t[0]?.quantity).toBe(1);
    expect(t[0]?.pnlGross).toBe(20);
  });
  it("second: qty2 -2pts -> -20 gross", () => {
    expect(t[1]?.quantity).toBe(2);
    expect(t[1]?.pnlGross).toBe(-20);
  });
  it("fees split proportionally (1+1=2 / 2+2=4)", () => {
    expect(t[0]?.fees).toBe(2);
    expect(t[1]?.fees).toBe(4);
  });
});

describe("4. reversal (long 1 -> sell 3 -> buy 2)", () => {
  const t = pairFills([
    f(8, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(9, ES, 1, 3, 5010, "2026-07-01T13:55:00Z", 6),
    f(10, ES, 0, 2, 5005, "2026-07-01T14:15:00Z", 4),
  ]);
  it("two round trips", () => expect(t.length).toBe(2));
  it("first closes the long: qty1 +10pts = 500 gross", () => {
    expect(t[0]?.side).toBe("long");
    expect(t[0]?.quantity).toBe(1);
    expect(t[0]?.pnlGross).toBe(500);
  });
  it("second closes the reversal short: qty2 (5010-5005) x 2 x 50 = 500", () => {
    expect(t[1]?.side).toBe("short");
    expect(t[1]?.quantity).toBe(2);
    expect(t[1]?.pnlGross).toBe(500);
  });
});

describe("5. scale-in weighted entry (1@5000 + 1@5002 -> sell 2@5003)", () => {
  const t = pairFills([
    f(11, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(12, ES, 0, 1, 5002, "2026-07-01T13:40:00Z", 2),
    f(13, ES, 1, 2, 5003, "2026-07-01T13:55:00Z", 4),
  ]);
  it("entry weighted to 5001", () => expect(t[0]?.entryPrice).toBe(5001));
  it("gross (5003-5001) x 2 x 50 = 200", () => expect(t[0]?.pnlGross).toBe(200));
  it("entryTime = first lot (FIFO)", () =>
    expect(t[0]?.entryTime.toISOString()).toBe("2026-07-01T13:35:00.000Z"));
});

describe("6. gateway P&L passthrough when a fill is fully matched", () => {
  const t = pairFills([
    f(14, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(15, ES, 1, 1, 5002, "2026-07-01T13:50:00Z", 2, 97.5),
  ]);
  it("uses gateway pnl 97.5 gross, net 93.5", () => {
    expect(t[0]?.pnlGross).toBe(97.5);
    expect(t[0]?.pnl).toBe(93.5);
  });
});

describe("7. open position emits no trade", () => {
  const t = pairFills([f(16, ES, 0, 2, 5000, "2026-07-01T13:35:00Z", 4)]);
  it("no round trips for an open position", () => expect(t.length).toBe(0));
});

// ===========================================================================
// New coverage.
// ===========================================================================

describe("out-of-order fills are sorted internally before pairing", () => {
  // The closing fill is passed FIRST in the array, before the opening fill.
  const t = pairFills([
    f(21, ES, 1, 1, 5002, "2026-07-01T13:50:00Z", 2), // exit, listed first
    f(20, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2), // entry, listed second
  ]);
  it("still produces one correctly-directed round trip", () => {
    expect(t.length).toBe(1);
    expect(t[0]?.side).toBe("long");
    expect(t[0]?.entryPrice).toBe(5000);
    expect(t[0]?.exitPrice).toBe(5002);
  });
  it("entry/exit times come out in chronological order", () => {
    expect(t[0]?.entryTime.toISOString()).toBe("2026-07-01T13:35:00.000Z");
    expect(t[0]?.exitTime?.toISOString()).toBe("2026-07-01T13:50:00.000Z");
  });
  it("gross (5002-5000) x 1 x 50 = 100", () => expect(t[0]?.pnlGross).toBe(100));
});

describe("scaled in across 3 entries AND out across 2 exits", () => {
  // Entries: 1@5000, 2@5006, 1@5010  (4 long ES). Feed them out of order too,
  // to prove FIFO consumption order is by timestamp, not array order.
  const t = pairFills([
    f(32, ES, 1, 2, 5008, "2026-07-01T14:00:00Z"), // exit 1 (2 lots)
    f(30, ES, 0, 1, 5000, "2026-07-01T13:30:00Z"), // entry 1
    f(33, ES, 1, 2, 5012, "2026-07-01T14:05:00Z"), // exit 2 (2 lots)
    f(31, ES, 0, 2, 5006, "2026-07-01T13:40:00Z"), // entry 2
    f(34, ES, 0, 1, 5010, "2026-07-01T13:50:00Z"), // entry 3
  ]);

  // Sorted timeline: buy1@5000, buy2@5006, buy1@5010, sell2@5008, sell2@5012.
  // Exit 1 consumes the two oldest lots: 1@5000 + 1@5006 -> weighted 5003.
  // Exit 2 consumes the next two:        1@5006 + 1@5010 -> weighted 5008.
  it("emits exactly two round trips", () => expect(t.length).toBe(2));

  it("exit 1: FIFO weighted entry 5003, P&L (5008-5003) x 2 x 50 = 500", () => {
    expect(t[0]?.quantity).toBe(2);
    expect(t[0]?.entryPrice).toBe(5003);
    expect(t[0]?.exitPrice).toBe(5008);
    expect(t[0]?.pnlGross).toBe(500);
  });

  it("exit 2: FIFO weighted entry 5008, P&L (5012-5008) x 2 x 50 = 400", () => {
    expect(t[1]?.quantity).toBe(2);
    expect(t[1]?.entryPrice).toBe(5008);
    expect(t[1]?.exitPrice).toBe(5012);
    expect(t[1]?.pnlGross).toBe(400);
  });

  it("the whole 4-lot position is fully closed (total qty 4)", () => {
    expect((t[0]?.quantity ?? 0) + (t[1]?.quantity ?? 0)).toBe(4);
  });
});

describe("multi-account: fills from two accounts never cross-pair", () => {
  it("a buy on account 1 and a sell on account 2 stay two OPEN positions", () => {
    // If open lots were keyed by contract alone, these would (wrongly) pair into
    // a closed +$500 long. Keyed by account+contract, both remain open -> no trade.
    const t = pairFills([
      f(40, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 0, null, 1), // account 1 buys
      f(41, ES, 1, 1, 5010, "2026-07-01T13:50:00Z", 0, null, 2), // account 2 sells
    ]);
    expect(t.length).toBe(0);
  });

  it("each account still pairs its own fills correctly when interleaved", () => {
    const t = pairFills([
      f(42, ES, 0, 2, 5000, "2026-07-01T13:30:00Z", 0, null, 1), // acct 1 opens long
      f(43, ES, 1, 1, 5100, "2026-07-01T13:35:00Z", 0, null, 2), // acct 2 opens short
      f(44, ES, 1, 2, 5005, "2026-07-01T13:40:00Z", 0, null, 1), // acct 1 closes long
      f(45, ES, 0, 1, 5090, "2026-07-01T13:45:00Z", 0, null, 2), // acct 2 closes short
    ]);
    expect(t.length).toBe(2);
    // acct 1 long: (5005-5000) x 2 x 50 = 500
    expect(t[0]?.side).toBe("long");
    expect(t[0]?.pnlGross).toBe(500);
    // acct 2 short: (5100-5090) x 1 x 50 = 500
    expect(t[1]?.side).toBe("short");
    expect(t[1]?.pnlGross).toBe(500);
  });
});
