// Journal paging (spec test 4) — "Load older trades" must never skip or repeat
// a trade, even when several trades share the exact same entry time; the pages
// joined must equal the full newest-first list; filters and paging must agree
// with the totals; the page size is capped on the server; a bad cursor gets a
// plain 400.
//
// Calls the real data-layer function (getTradesPage) and the real
// GET /api/trades/page handler against the throwaway SQLite database, with a
// settable "who is signed in" (same approach as profile-time-zone.test.ts).

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
}));

import { GET } from "@/app/api/trades/page/route";
import { prisma } from "@/lib/db";
import {
  getTradesPage,
  clampPageSize,
  decodeTradeCursor,
  encodeTradeCursor,
  InvalidCursorError,
  type TradePageFilter,
} from "@/lib/data";
import { etDayKey } from "@/lib/rules/engine";
import { resetRateLimit } from "@/lib/rate-limit";
import { JOURNAL_PAGE_MAX } from "@/lib/journal-rows";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();
let userId = "";
let accountA = "";
let accountB = "";
let bigUserId = "";

/** Every trade of the user, in the journal's order (newest first, id breaks ties). */
async function fullList(where: Record<string, unknown> = {}): Promise<string[]> {
  const rows = await prisma.trade.findMany({
    where: { userId, ...where },
    orderBy: [{ entryTime: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Walk every page with `limit`, returning the ids in order and each page's cursor. */
async function walk(uid: string, limit: number, filter: TradePageFilter = {}) {
  const ids: string[] = [];
  const totals = new Set<number>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await getTradesPage(uid, { filter, limit, cursor });
    ids.push(...page.rows.map((r) => r.id));
    totals.add(page.total);
    cursor = page.nextCursor;
    pages += 1;
    if (pages > 500) throw new Error("paging never ended");
  } while (cursor);
  return { ids, totals, pages };
}

const get = (qs: string) => GET(new Request(`http://localhost/api/trades/page?${qs}`));

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `paging-${stamp}@example.com`, passwordHash: "x", displayName: "Pager" },
  });
  userId = user.id;
  accountA = (await prisma.tradingAccount.create({ data: { userId, name: "Paging A" } })).id;
  accountB = (await prisma.tradingAccount.create({ data: { userId, name: "Paging B" } })).id;

  // 23 trades over several days. Five of them share ONE entry time (a basket
  // fill), and three more share another — the cases a time-only cursor gets wrong.
  const shared = new Date("2026-07-02T14:00:00Z");
  const shared2 = new Date("2026-07-06T15:30:00Z");
  const specs: { at: Date; symbol: string; pnl: number; account: string; closed?: boolean }[] = [];
  for (let i = 0; i < 5; i += 1) specs.push({ at: shared, symbol: i % 2 ? "MES" : "ES", pnl: i % 2 ? -20 : 40, account: accountA });
  for (let i = 0; i < 3; i += 1) specs.push({ at: shared2, symbol: "NQ", pnl: 15 * (i + 1), account: accountB });
  for (let d = 0; d < 15; d += 1) {
    specs.push({
      at: new Date(Date.UTC(2026, 6, 1 + d, 13 + (d % 3), 45)),
      symbol: ["ES", "MES", "NQ"][d % 3],
      pnl: d % 4 === 0 ? 0 : d % 2 ? -35 : 60,
      account: d % 2 ? accountA : accountB,
      closed: d !== 14, // the newest one is still open
    });
  }
  // An ET-boundary trade: 23:30 New York on 30 Jun = 03:30 UTC on 1 Jul.
  specs.push({ at: new Date("2026-07-01T03:30:00Z"), symbol: "ES", pnl: 10, account: accountA });

  for (const s of specs) {
    const closed = s.closed !== false;
    await prisma.trade.create({
      data: {
        userId,
        accountId: s.account,
        symbol: s.symbol,
        side: "long",
        entryPrice: 5000,
        exitPrice: closed ? 5001 : null,
        quantity: 1,
        entryTime: s.at,
        exitTime: closed ? new Date(s.at.getTime() + 600_000) : null,
        pnl: s.pnl,
        source: s.symbol === "NQ" ? "csv" : "manual",
      },
    });
  }

  // A second trader with 130 trades — more than the server cap of 100.
  const big = await prisma.user.create({
    data: { email: `paging-big-${stamp}@example.com`, passwordHash: "x", displayName: "Big" },
  });
  bigUserId = big.id;
  const bigAccount = await prisma.tradingAccount.create({ data: { userId: big.id, name: "Big" } });
  await prisma.trade.createMany({
    data: Array.from({ length: 130 }, (_, i) => ({
      userId: big.id,
      accountId: bigAccount.id,
      symbol: "ES",
      side: "long",
      entryPrice: 5000,
      exitPrice: 5001,
      quantity: 1,
      // Pairs of trades share an entry time.
      entryTime: new Date(Date.UTC(2026, 3, 1, 13, Math.floor(i / 2))),
      exitTime: new Date(Date.UTC(2026, 3, 1, 15, 0)),
      pnl: 5,
      source: "manual",
    })),
  });

  session.current = {
    id: userId,
    email: user.email,
    displayName: "Pager",
    plan: "pro",
    billingStatus: "active",
    timezone: "America/New_York",
    trialEndsAt: null,
  };
});

beforeEach(() => {
  resetRateLimit(`trades:page:user:${userId}`);
});

afterAll(async () => {
  await prisma.trade.deleteMany({ where: { userId: { in: [userId, bigUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, bigUserId] } } });
});

describe("getTradesPage — no skip, no duplicate", () => {
  it("pages joined equal the full newest-first list, for every page size", async () => {
    const all = await fullList();
    expect(all.length).toBe(24);
    for (const limit of [1, 2, 3, 4, 5, 7, 24, 25, 100]) {
      const { ids, totals } = await walk(userId, limit);
      expect(ids).toEqual(all);
      expect(new Set(ids).size).toBe(ids.length); // no duplicate
      expect([...totals]).toEqual([24]); // the total never changes while paging
    }
  });

  it("a page boundary inside a group of identical entry times loses nothing", async () => {
    // With limit 2 the five shared-time trades are split across three pages.
    const shared = new Date("2026-07-02T14:00:00Z").getTime();
    const { ids } = await walk(userId, 2);
    const sharedIds = (
      await prisma.trade.findMany({ where: { userId, entryTime: new Date(shared) }, select: { id: true } })
    ).map((r) => r.id);
    expect(sharedIds.length).toBe(5);
    for (const id of sharedIds) expect(ids.filter((x) => x === id)).toHaveLength(1);
  });

  it("the last page ends cleanly with no next cursor", async () => {
    const first = await getTradesPage(userId, { limit: 20 });
    expect(first.rows).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const last = await getTradesPage(userId, { limit: 20, cursor: first.nextCursor });
    expect(last.rows).toHaveLength(4);
    expect(last.nextCursor).toBeNull();
    // An exact fit also ends with null (no empty extra page).
    const exact = await getTradesPage(userId, { limit: 24 });
    expect(exact.rows).toHaveLength(24);
    expect(exact.nextCursor).toBeNull();
  });
});

describe("getTradesPage — filters and totals agree", () => {
  it("each filter pages to exactly its own matching trades", async () => {
    const cases: [TradePageFilter, Record<string, unknown>][] = [
      [{ symbol: "ES" }, { symbol: "ES" }],
      [{ accountId: accountB }, { accountId: accountB }],
      [{ source: "csv" }, { source: "csv" }],
      [{ outcome: "win" }, { exitTime: { not: null }, pnl: { gt: 0 } }],
      [{ outcome: "loss" }, { exitTime: { not: null }, pnl: { lt: 0 } }],
      [{ symbol: "NQ", accountId: accountB }, { symbol: "NQ", accountId: accountB }],
    ];
    for (const [filter, where] of cases) {
      const expected = await fullList(where);
      const { ids, totals } = await walk(userId, 3, filter);
      expect(ids).toEqual(expected);
      expect([...totals]).toEqual([expected.length]);
    }
  });

  it("split by symbol (or account), the filtered totals add up to the unfiltered total", async () => {
    const all = (await getTradesPage(userId, { limit: 1 })).total;
    let bySymbol = 0;
    for (const symbol of ["ES", "MES", "NQ"]) bySymbol += (await getTradesPage(userId, { filter: { symbol }, limit: 1 })).total;
    expect(bySymbol).toBe(all);
    const byAccount =
      (await getTradesPage(userId, { filter: { accountId: accountA }, limit: 1 })).total +
      (await getTradesPage(userId, { filter: { accountId: accountB }, limit: 1 })).total;
    expect(byAccount).toBe(all);
  });

  it("date filters use New York calendar days — the same boundary as etDayKey", async () => {
    const everything = await prisma.trade.findMany({ where: { userId } });
    for (const [fromDay, toDay] of [
      ["2026-07-01", "2026-07-03"],
      ["2026-06-30", "2026-06-30"],
      ["2026-07-10", undefined],
      [undefined, "2026-07-02"],
    ] as [string | undefined, string | undefined][]) {
      const expected = everything
        .filter((t) => {
          const k = etDayKey(t.entryTime);
          return (!fromDay || k >= fromDay) && (!toDay || k <= toDay);
        })
        .map((t) => t.id)
        .sort();
      const { ids } = await walk(userId, 4, { fromDay, toDay });
      expect([...ids].sort()).toEqual(expected);
    }
    // The 23:30 New York trade on 30 June is a 30 June trade, not 1 July.
    const june30 = await getTradesPage(userId, { filter: { fromDay: "2026-06-30", toDay: "2026-06-30" } });
    expect(june30.total).toBe(1);
  });
});

describe("page size cap", () => {
  it("clamps any requested size to 1..100", () => {
    expect(clampPageSize(1000)).toBe(JOURNAL_PAGE_MAX);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-5)).toBe(1);
    expect(clampPageSize(25.9)).toBe(25);
    expect(clampPageSize(undefined)).toBe(JOURNAL_PAGE_MAX);
    expect(clampPageSize(Number.NaN)).toBe(JOURNAL_PAGE_MAX);
  });

  it("the data layer never returns more than 100 rows, and still reaches every trade", async () => {
    const page = await getTradesPage(bigUserId, { limit: 5000 });
    expect(page.rows).toHaveLength(100);
    expect(page.total).toBe(130);
    const { ids } = await walk(bigUserId, 5000);
    expect(ids).toHaveLength(130);
    expect(new Set(ids).size).toBe(130);
  });

  it("the route refuses a page larger than 100 and accepts 100", async () => {
    expect((await get("limit=101")).status).toBe(400);
    expect((await get("limit=0")).status).toBe(400);
    const ok = await get("limit=100");
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.ok).toBe(true);
    expect(json.rows).toHaveLength(24);
    expect(json.total).toBe(24);
    expect(json.nextCursor).toBeNull();
  });
});

describe("bad cursors", () => {
  it("a cursor round-trips and malformed ones throw InvalidCursorError", () => {
    const c = { entryTime: new Date("2026-07-02T14:00:00Z"), id: "cabc123" };
    expect(decodeTradeCursor(encodeTradeCursor(c))).toEqual(c);
    for (const raw of [
      "",
      "!!!",
      "not base64 at all",
      Buffer.from("no-separator").toString("base64url"),
      Buffer.from("abc:cabc123").toString("base64url"),
      Buffer.from("123:bad id with spaces").toString("base64url"),
      "x".repeat(300),
    ]) {
      expect(() => decodeTradeCursor(raw)).toThrow(InvalidCursorError);
    }
  });

  it("the route answers a bad cursor with a plain 400, not a crash", async () => {
    for (const cursor of ["!!!", Buffer.from("abc:def").toString("base64url"), "x".repeat(150)]) {
      const res = await get(`limit=10&cursor=${encodeURIComponent(cursor)}`);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(typeof json.error).toBe("string");
      expect(json.error).not.toMatch(/prisma|stack|at \w+ \(/i);
    }
  });

  it("the route walks every page with the cursors it hands out", async () => {
    const all = await fullList();
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(`limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      seen.push(...json.rows.map((r: { id: string }) => r.id));
      cursor = json.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all);
  });

  it("the route refuses backwards dates with a plain error", async () => {
    const res = await get("from=2026-07-10&to=2026-07-01");
    expect(res.status).toBe(400);
    expect((await get("from=2026-02-30")).status).toBe(400);
  });
});
