// The free tier's rule-engine allowance, proven through the REAL API routes.
//
// The free plan now includes a working rule engine — 1 rulebook and 3 rules —
// so a free trader's discipline score is graded against rules they wrote
// themselves. Two things must therefore hold, and neither may drift:
//
//  1. The cap is enforced ON THE SERVER. The screen hides the button when the
//     allowance is spent, but a request that arrives anyway is refused in plain
//     English and NOTHING is written.
//  2. The allowance is PER TRADER. One person filling their three rules must
//     never spend, or be blocked by, anybody else's — the rule count is taken
//     through ruleBook.userId, never by rulebook id alone.
//
// These call the route handlers themselves (same approach as
// auth-route-error-handling.test.ts) against the throwaway SQLite database.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// A settable "who is signed in" for the routes under test.
const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!session.current) throw new Error("UNAUTHORIZED");
    return session.current;
  },
}));

import { POST as createRuleBook } from "@/app/api/rulebooks/route";
import { POST as createRule } from "@/app/api/rules/route";
import { prisma } from "@/lib/db";

// Hard rail: this file writes to a database. Refuse to run if that database is
// the seeded dev DB — the suite must only ever touch the throwaway file.
const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();

type Trader = { id: string; email: string };

async function makeTrader(
  label: string,
  plan: string,
  billingStatus: string
): Promise<Trader & { plan: string; billingStatus: string }> {
  const email = `quota-${label}-${stamp}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: label, plan, billingStatus },
  });
  return { id: user.id, email, plan, billingStatus };
}

/** Sign in as this trader for every following request. */
function signIn(trader: { id: string; email: string; plan: string; billingStatus: string }) {
  session.current = {
    id: trader.id,
    email: trader.email,
    displayName: null,
    plan: trader.plan,
    billingStatus: trader.billingStatus,
    timezone: "UTC",
    trialEndsAt: null,
  };
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function addRuleBook(name: string) {
  const res = await createRuleBook(post("http://localhost/api/rulebooks", { name }));
  return { status: res.status, body: (await res.json()) as { ok: boolean; id?: string; error?: string } };
}

async function addRule(ruleBookId: string, name: string) {
  const res = await createRule(
    post("http://localhost/api/rules", {
      ruleBookId,
      name,
      type: "max_trades",
      severity: "medium",
      config: { maxPerDay: 3 },
    })
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; id?: string; error?: string } };
}

let freeA: Awaited<ReturnType<typeof makeTrader>>;
let freeB: Awaited<ReturnType<typeof makeTrader>>;
let paid: Awaited<ReturnType<typeof makeTrader>>;
let trialing: Awaited<ReturnType<typeof makeTrader>>;

beforeAll(async () => {
  freeA = await makeTrader("free-a", "free", "active");
  freeB = await makeTrader("free-b", "free", "active");
  paid = await makeTrader("pro", "pro", "active");
  trialing = await makeTrader("trial", "free", "trialing");
});

afterAll(async () => {
  session.current = null;
  await prisma.user.deleteMany({ where: { email: { startsWith: "quota-" } } });
  await prisma.$disconnect();
});

describe("free plan — 1 rulebook", () => {
  it("creates the first rulebook, then refuses the second in plain English", async () => {
    signIn(freeA);
    const first = await addRuleBook("A's plan");
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const second = await addRuleBook("A's second plan");
    expect(second.status).toBe(403);
    expect(second.body.ok).toBe(false);
    expect(second.body.error).toBe(
      "Your plan includes 1 rulebook. Upgrade to Pro for unlimited rulebooks."
    );

    // Nothing was written by the refused request.
    expect(await prisma.ruleBook.count({ where: { userId: freeA.id } })).toBe(1);
  });
});

describe("free plan — 3 rules in total", () => {
  it("creates three rules, then refuses the fourth and writes nothing", async () => {
    signIn(freeA);
    const book = await prisma.ruleBook.findFirstOrThrow({ where: { userId: freeA.id } });

    for (const n of [1, 2, 3]) {
      const res = await addRule(book.id, `A rule ${n}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    }

    const fourth = await addRule(book.id, "A rule 4");
    expect(fourth.status).toBe(403);
    expect(fourth.body.ok).toBe(false);
    expect(fourth.body.error).toBe("Your plan includes 3 rules. Upgrade to Pro for unlimited rules.");

    expect(await prisma.rule.count({ where: { ruleBook: { userId: freeA.id } } })).toBe(3);
  });
});

describe("the allowance is one trader's own", () => {
  it("a free trader at their cap does not block another free trader's first rule", async () => {
    signIn(freeB);
    const book = await addRuleBook("B's plan");
    expect(book.body.ok).toBe(true);

    const rule = await addRule(book.body.id!, "B rule 1");
    expect(rule.status).toBe(200);
    expect(rule.body.ok).toBe(true);

    expect(await prisma.rule.count({ where: { ruleBook: { userId: freeB.id } } })).toBe(1);
    // A's rules are untouched and still exactly three.
    expect(await prisma.rule.count({ where: { ruleBook: { userId: freeA.id } } })).toBe(3);
  });

  it("a free trader cannot add rules to somebody else's rulebook", async () => {
    const aBook = await prisma.ruleBook.findFirstOrThrow({ where: { userId: freeA.id } });
    signIn(freeB);
    const stolen = await addRule(aBook.id, "B writing into A's book");
    expect(stolen.status).toBe(404);
    expect(await prisma.rule.count({ where: { ruleBook: { userId: freeA.id } } })).toBe(3);
  });
});

describe("paid and trialing traders are uncapped", () => {
  it("Pro creates several rulebooks and more rules than the free allowance", async () => {
    signIn(paid);
    const one = await addRuleBook("Pro book 1");
    const two = await addRuleBook("Pro book 2");
    expect(one.body.ok).toBe(true);
    expect(two.body.ok).toBe(true);

    for (const n of [1, 2, 3, 4, 5]) {
      const res = await addRule(one.body.id!, `Pro rule ${n}`);
      expect(res.status).toBe(200);
    }
    expect(await prisma.rule.count({ where: { ruleBook: { userId: paid.id } } })).toBe(5);
  });

  it("a free account inside its trial gets a fourth rule (trial = Pro access)", async () => {
    signIn(trialing);
    const book = await addRuleBook("Trial book");
    for (const n of [1, 2, 3]) {
      expect((await addRule(book.body.id!, `Trial rule ${n}`)).status).toBe(200);
    }
    const fourth = await addRule(book.body.id!, "Trial rule 4");
    expect(fourth.status).toBe(200);
    expect(fourth.body.ok).toBe(true);
  });
});
