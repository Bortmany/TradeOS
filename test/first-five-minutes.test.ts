// "First five minutes to a graded trade", through the REAL routes against the
// throwaway database:
//  - demo sign-in lands on the demo user only, and is limited per visitor
//  - sign-up signs you in; a duplicate email gets a plain explanation
//  - a file that is not a broker CSV is refused and creates NO import row
//  - importing with an inline-created account stays inside the signed-in user
//  - "Clear sample trades" only touches the signed-in user's sample trades

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { jwtVerify } from "jose";

const { jar, session } = vi.hoisted(() => ({
  jar: new Map<string, { value: string }>(),
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => jar.set(name, { value }),
    delete: (name: string) => jar.delete(name),
  }),
}));

// Real auth (cookies, register, demo sign-in) except `withUser`, which reads the
// signed-in user from `session` so import / sample routes can be driven as a trader.
vi.mock("@/lib/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth")>();
  return {
    ...actual,
    withUser:
      (handler: (u: unknown, ...a: unknown[]) => Promise<Response>) =>
      async (...args: unknown[]) => {
        if (!session.current) return new Response("Unauthorized", { status: 401 });
        return handler(session.current, ...args);
      },
  };
});

import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as importPOST } from "@/app/api/import/route";
import { DELETE as clearSamplesDELETE } from "@/app/api/demo-data/route";
import { prisma } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/demo-desk";
import { loadSampleData } from "@/lib/demo";
import { resetRateLimit } from "@/lib/rate-limit";
import { EMAIL_TAKEN_ERROR, NOT_A_CSV_ERROR } from "@/lib/validation";

if ((process.env.DATABASE_URL ?? "").includes("dev.db")) {
  throw new Error("Refusing to run: DATABASE_URL points at the dev database.");
}

const stamp = Date.now();
const TOPSTEPX_CSV = readFileSync(new URL("../public/samples/topstepx-sample.csv", import.meta.url), "utf8");

function post(url: string, body: unknown, socketIp?: string): Request {
  const req = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (socketIp) Object.assign(req, { socket: { remoteAddress: socketIp } });
  return req;
}
const as = (u: { id: string; email: string } | null) => {
  session.current = u ? { ...u, plan: "pro", billingStatus: "active" } : null;
};

let demoUserId: string;
let alice: { id: string; email: string };
let bob: { id: string; email: string };
let aliceAccountId: string;
let createdDemo = false;

async function sessionUserId(): Promise<string | undefined> {
  const token = jar.get("tradeos_session")?.value;
  if (!token) return undefined;
  const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
  return payload.sub as string;
}

beforeAll(async () => {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    demoUserId = existing.id;
  } else {
    demoUserId = (await prisma.user.create({ data: { email: DEMO_EMAIL, passwordHash: "x" } })).id;
    createdDemo = true;
  }
  alice = await prisma.user.create({
    data: { email: `ff-alice-${stamp}@example.com`, passwordHash: "x" },
    select: { id: true, email: true },
  });
  bob = await prisma.user.create({
    data: { email: `ff-bob-${stamp}@example.com`, passwordHash: "x" },
    select: { id: true, email: true },
  });
  aliceAccountId = (
    await prisma.tradingAccount.create({ data: { userId: alice.id, name: "Alice main", startingBalance: 1000 } })
  ).id;
});

beforeEach(() => {
  jar.clear();
  as(null);
  for (const u of [alice, bob]) resetRateLimit(`import:${u.id}`);
});

afterAll(async () => {
  const ids = [alice.id, bob.id];
  const fresh = await prisma.user.findMany({
    where: { email: { startsWith: `ff-new-${stamp}` } },
    select: { id: true },
  });
  const all = [...ids, ...fresh.map((u) => u.id)];
  await prisma.trade.deleteMany({ where: { userId: { in: all } } });
  await prisma.importBatch.deleteMany({ where: { userId: { in: all } } });
  await prisma.ruleBook.deleteMany({ where: { userId: { in: all } } });
  await prisma.disciplineSnapshot.deleteMany({ where: { userId: { in: all } } });
  await prisma.tradingAccount.deleteMany({ where: { userId: { in: all } } });
  await prisma.user.deleteMany({ where: { id: { in: all } } });
  if (createdDemo) await prisma.user.deleteMany({ where: { id: demoUserId } });
  await prisma.$disconnect();
});

describe("demo sign-in", () => {
  it("signs in as the demo user and nobody else", async () => {
    const res = await demoPOST(post("http://localhost/api/auth/demo", {}, "198.51.100.10"));
    expect(res.status).toBe(200);
    expect(await sessionUserId()).toBe(demoUserId);
    expect(await sessionUserId()).not.toBe(alice.id);
    expect(await sessionUserId()).not.toBe(bob.id);
  });

  it("is limited per visitor like login (10 per 15 minutes), other visitors unaffected", async () => {
    const ip = "198.51.100.77";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      jar.clear();
      statuses.push((await demoPOST(post("http://localhost/api/auth/demo", {}, ip))).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.slice(10)).toEqual([429, 429]);

    jar.clear();
    const other = await demoPOST(post("http://localhost/api/auth/demo", {}, "198.51.100.78"));
    expect(other.status).toBe(200);
  });

  it("the 429 says it in plain words", async () => {
    const ip = "198.51.100.90";
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      jar.clear();
      last = await demoPOST(post("http://localhost/api/auth/demo", {}, ip));
    }
    expect(last?.status).toBe(429);
    expect((await last!.json()).error).toMatch(/try again in a few minutes/i);
  });
});

describe("sign-up", () => {
  it("creates the account AND signs the new user straight in", async () => {
    const email = `ff-new-${stamp}-a@example.com`;
    const res = await registerPOST(
      post("http://localhost/api/auth/register", { email, password: "a-long-password-1" }, "198.51.100.21")
    );
    expect(res.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await sessionUserId()).toBe(row.id);
  });

  it("a duplicate email gets a plain explanation, no second account, no sign-in", async () => {
    const email = `ff-new-${stamp}-b@example.com`;
    await registerPOST(
      post("http://localhost/api/auth/register", { email, password: "a-long-password-1" }, "198.51.100.22")
    );
    jar.clear();
    const res = await registerPOST(
      post("http://localhost/api/auth/register", { email, password: "another-password-2" }, "198.51.100.22")
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("email_taken");
    expect(body.error).toBe(EMAIL_TAKEN_ERROR);
    expect(body.error).toMatch(/already has an account/i);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await sessionUserId()).toBeUndefined();
  });
});

describe("import: not a CSV, and the inline account", () => {
  const counts = async (userId: string) => ({
    batches: await prisma.importBatch.count({ where: { userId } }),
    trades: await prisma.trade.count({ where: { userId } }),
    accounts: await prisma.tradingAccount.count({ where: { userId } }),
  });

  it("an ordinary text file is refused and creates NO import record, trades or account", async () => {
    as(alice);
    const before = await counts(alice.id);
    for (const text of [
      "This is just a note I wrote about my trading day.\nIt has no table in it.",
      "%PDF-1.4 \u0000\u0001 binary-ish bytes",
      "   \n  \n",
    ]) {
      const asExisting = await importPOST(
        post("http://localhost/api/import", { accountId: aliceAccountId, csvText: text })
      );
      expect(asExisting.status).toBe(400);
      expect((await asExisting.json()).error).toBe(NOT_A_CSV_ERROR);
      const asNew = await importPOST(
        post("http://localhost/api/import", { newAccount: { name: "Ghost", startingBalance: 5 }, csvText: text })
      );
      expect(asNew.status).toBe(400);
    }
    expect(await counts(alice.id)).toEqual(before);
  });

  it("a real CSV with no trade rows keeps its own honest message (a header, nothing below)", async () => {
    as(alice);
    const res = await importPOST(
      post("http://localhost/api/import", {
        accountId: aliceAccountId,
        csvText: "Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time\n",
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.imported).toBe(0);
  });

  it("importing into a brand-new account puts the trades there and nowhere else", async () => {
    as(bob);
    const before = await counts(bob.id);
    const aliceBefore = await counts(alice.id);
    const res = await importPOST(
      post("http://localhost/api/import", {
        newAccount: { name: "Topstep 50K", startingBalance: 50000 },
        csvText: TOPSTEPX_CSV,
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.imported).toBeGreaterThan(0);

    const account = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: body.accountId } });
    expect(account.userId).toBe(bob.id);
    expect(account.name).toBe("Topstep 50K");
    expect(account.startingBalance).toBe(50000);
    expect(await prisma.trade.count({ where: { accountId: account.id } })).toBe(body.imported);
    expect(await prisma.trade.count({ where: { accountId: account.id, userId: { not: bob.id } } })).toBe(0);

    const after = await counts(bob.id);
    expect(after.accounts).toBe(before.accounts + 1);
    expect(after.batches).toBe(before.batches + 1);
    expect(await counts(alice.id)).toEqual(aliceBefore);
  });

  it("will not import into someone else's account, and needs exactly one account choice", async () => {
    as(bob);
    const theirs = await importPOST(
      post("http://localhost/api/import", { accountId: aliceAccountId, csvText: TOPSTEPX_CSV })
    );
    expect(theirs.status).toBe(404);
    const both = await importPOST(
      post("http://localhost/api/import", {
        accountId: aliceAccountId,
        newAccount: { name: "x" },
        csvText: TOPSTEPX_CSV,
      })
    );
    expect(both.status).toBe(400);
    const neither = await importPOST(post("http://localhost/api/import", { csvText: TOPSTEPX_CSV }));
    expect(neither.status).toBe(400);
  });
});

describe("sample trades", () => {
  it("'Load sample data' marks its trades as sample", async () => {
    const u = await prisma.user.create({
      data: { email: `ff-new-${stamp}-s@example.com`, passwordHash: "x" },
    });
    const r = await loadSampleData(u.id);
    expect(r.created).toBeGreaterThan(0);
    expect(await prisma.trade.count({ where: { userId: u.id, source: "sample" } })).toBe(r.created);
    expect(await prisma.trade.count({ where: { userId: u.id, source: { not: "sample" } } })).toBe(0);
  });

  it("clearing only touches the signed-in user's sample trades", async () => {
    const mk = (userId: string, accountId: string, source: string, n: number) =>
      prisma.trade.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          userId,
          accountId,
          symbol: "ES",
          side: "long",
          entryPrice: 5000,
          exitPrice: 5001,
          quantity: 1,
          entryTime: new Date(`2026-07-0${i + 1}T14:00:00Z`),
          exitTime: new Date(`2026-07-0${i + 1}T15:00:00Z`),
          pnl: 50,
          source,
        })),
      });
    const bobAccount = await prisma.tradingAccount.findFirstOrThrow({ where: { userId: bob.id } });
    await mk(alice.id, aliceAccountId, "sample", 3);
    await mk(alice.id, aliceAccountId, "manual", 2);
    await mk(alice.id, aliceAccountId, "csv", 1);
    await mk(bob.id, bobAccount.id, "sample", 2);
    await prisma.ruleBook.create({ data: { userId: alice.id, name: "Keep me" } });

    const bobSamplesBefore = await prisma.trade.count({ where: { userId: bob.id, source: "sample" } });
    const aliceOthersBefore = await prisma.trade.count({ where: { userId: alice.id, source: { not: "sample" } } });

    as(alice);
    const res = await clearSamplesDELETE();
    expect(res.status).toBe(200);
    expect((await res.json()).cleared).toBe(3);

    expect(await prisma.trade.count({ where: { userId: alice.id, source: "sample" } })).toBe(0);
    expect(await prisma.trade.count({ where: { userId: alice.id, source: { not: "sample" } } })).toBe(aliceOthersBefore);
    expect(await prisma.trade.count({ where: { userId: bob.id, source: "sample" } })).toBe(bobSamplesBefore);
    expect(await prisma.ruleBook.count({ where: { userId: alice.id, name: "Keep me" } })).toBe(1);
  });

  it("the demo desk cannot clear anything", async () => {
    as({ id: demoUserId, email: DEMO_EMAIL });
    const res = await clearSamplesDELETE();
    expect(res.status).toBe(403);
  });
});
