// Weekly coaching review job: eligibility, idempotency, scheduled usage, email, cron route, timer rule.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { prisma } from "@/lib/db";
import { runWeeklyCoaching, WEEKLY_COACHING_LOCK_KEY } from "@/lib/ai/weekly";
import { shouldRunWeeklyNow } from "@/lib/ai/weekly-scheduler";
import { usedToday } from "@/lib/ai/service";
import { DEMO_EMAIL } from "@/lib/demo-desk";
import { resetEmailWarningForTests } from "@/lib/email";
import { GET } from "@/app/api/cron/coaching-weekly/route";

const NOW = new Date("2026-10-14T16:00:00Z"); // Wednesday; finished week starts 2026-10-05
const stamp = Date.now();
const USAGE = { input_tokens: 50, output_tokens: 20 };
const WEEK = {
  summary: "A steady week.",
  wins: ["Kept the loss limit <b>"],
  mistakes: ["One late entry"],
  focusNextWeek: "Stop at your cut-off.",
  previousFocusVerdict: null,
};
const reply = () => ({ content: [{ type: "text", text: JSON.stringify(WEEK) }], usage: USAGE });

const ENV = [
  "AI_COACHING_ENABLED", "ANTHROPIC_API_KEY", "AI_DAILY_CAP_GLOBAL", "RESEND_API_KEY", "EMAIL_FROM",
  "CRON_SECRET",
];
function on() {
  process.env.AI_COACHING_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
}

let n = 0;
async function makeUser(extra: Record<string, unknown> = {}, tradeDay: string | null = "2026-10-07", email?: string) {
  n += 1;
  const addr = email ?? `cw-${stamp}-${n}@example.com`;
  const u = await prisma.user.create({ data: { email: addr, passwordHash: "x", ...extra } });
  if (tradeDay) {
    const acct = await prisma.tradingAccount.create({ data: { userId: u.id, name: "a", startingBalance: 50000 } });
    await prisma.trade.create({
      data: {
        userId: u.id, accountId: acct.id, symbol: "ZZ", side: "long", entryPrice: 100, exitPrice: 101,
        quantity: 1, entryTime: new Date(`${tradeDay}T15:00:00Z`), exitTime: new Date(`${tradeDay}T15:30:00Z`),
        pnl: 25, isWin: true,
      },
    });
  }
  return { id: u.id, email: addr };
}
const weeklyNotes = (userId: string) => prisma.coachingNote.count({ where: { userId, kind: "weekly" } });

beforeEach(async () => {
  for (const k of ENV) delete process.env[k];
  create.mockReset();
  create.mockResolvedValue(reply());
  resetEmailWarningForTests();
  await prisma.aiUsage.deleteMany();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await prisma.aiUsage.deleteMany();
  await prisma.user.deleteMany({ where: { email: { startsWith: `cw-${stamp}-` } } });
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  await prisma.$disconnect();
});

describe("cron route", () => {
  const req = (auth?: string) =>
    new Request("http://x/api/cron/coaching-weekly", { headers: auth ? { authorization: auth } : {} });
  it("503 without a secret, 401 when wrong, 200 when right", async () => {
    expect((await GET(req())).status).toBe(503);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    const ok = await GET(req("Bearer s3cret-value"));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ ok: true, outcome: "skipped" }); // coaching is off here
    expect(typeof body.time).toBe("string");
  });
});

describe("weekly run", () => {
  it("only does nothing (and does not call the model) when coaching is off", async () => {
    const u = await makeUser();
    const r = await runWeeklyCoaching({ now: NOW });
    expect(r.outcome).toBe("skipped");
    expect(create).not.toHaveBeenCalled();
    expect(await weeklyNotes(u.id)).toBe(0);
  });

  it("writes one note per eligible user, skips the rest, and is idempotent", async () => {
    on();
    const good = await makeUser();
    const noTrades = await makeUser({}, null);
    const wrongWeek = await makeUser({}, "2026-10-14"); // current week
    const off = await makeUser({ coachingEnabled: false });
    const weeklyOff = await makeUser({ coachingWeekly: false });
    const reviewed = await makeUser();
    await prisma.coachingNote.create({
      data: { userId: reviewed.id, kind: "weekly", subjectKey: "2026-10-05", inputHash: "h", content: "{}", model: "m" },
    });
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    const demo = await makeUser({}, "2026-10-07", DEMO_EMAIL);

    const r = await runWeeklyCoaching({ now: NOW });
    expect(r.outcome).toBe("ran");
    expect(r.weekStart).toBe("2026-10-05");
    expect(r.generated).toBeGreaterThanOrEqual(1);
    expect(await weeklyNotes(good.id)).toBe(1);
    for (const u of [noTrades, wrongWeek, off, weeklyOff, demo]) expect(await weeklyNotes(u.id)).toBe(0);
    expect(await weeklyNotes(reviewed.id)).toBe(1); // untouched

    const calls = create.mock.calls.length;
    const again = await runWeeklyCoaching({ now: NOW });
    expect(again.outcome).toBe("ran");
    expect(again.generated).toBe(0);
    expect(create.mock.calls.length).toBe(calls);
    expect(await weeklyNotes(good.id)).toBe(1);

    // lease given back
    const lease = await prisma.runnerLease.findUnique({ where: { name: `runner:${WEEKLY_COACHING_LOCK_KEY}` } });
    expect(lease!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("usage row is scheduled and the user's daily count stays 0", async () => {
    on();
    const u = await makeUser();
    await runWeeklyCoaching({ now: NOW });
    const row = await prisma.aiUsage.findFirst({ where: { userId: u.id } });
    expect(row).toMatchObject({ kind: "weekly", scheduled: true });
    expect(await usedToday(u.id, NOW)).toBe(0);
  });

  it("does not start a trader when too little time is left", async () => {
    on();
    const u = await makeUser();
    // 20 s left: not expired, but under the 25 s start threshold.
    const r = await runWeeklyCoaching({ now: NOW, deadlineMs: 20_000 });
    expect(r.outcome).toBe("ran");
    expect(r.stoppedEarly).toBe(true);
    expect(r.generated).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(await weeklyNotes(u.id)).toBe(0);
  });

  it("a normal deadline still generates the note", async () => {
    on();
    const u = await makeUser();
    const r = await runWeeklyCoaching({ now: NOW, deadlineMs: 50_000 });
    expect(r.stoppedEarly).toBe(false);
    expect(r.generated).toBeGreaterThanOrEqual(1);
    expect(await weeklyNotes(u.id)).toBe(1);
  });

  it("one trader whose call fails does not stop the next", async () => {
    on();
    const first = await makeUser();
    const second = await makeUser();
    create.mockRejectedValueOnce(new Error("boom")); // the first call fails; the rest work
    const r = await runWeeklyCoaching({ now: NOW });
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(r.generated).toBeGreaterThanOrEqual(1);
    const total = (await weeklyNotes(first.id)) + (await weeklyNotes(second.id));
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it("stops retrying a trader after 3 failed runs in the same week", async () => {
    on();
    // A different week from the other tests so earlier attempts do not count.
    const later = new Date("2026-10-28T16:00:00Z"); // finished week starts 2026-10-19
    const u = await makeUser({}, "2026-10-21");
    create.mockRejectedValue(new Error("boom"));
    for (let i = 0; i < 3; i++) await runWeeklyCoaching({ now: later });
    const calls = create.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await runWeeklyCoaching({ now: later });
    expect(create.mock.calls.length).toBe(calls);
    expect(await weeklyNotes(u.id)).toBe(0);
  });

  it("stops early when the global cap is reached", async () => {
    on();
    process.env.AI_DAILY_CAP_GLOBAL = "1";
    await makeUser();
    await makeUser();
    const r = await runWeeklyCoaching({ now: NOW });
    expect(r.stoppedEarly).toBe(true);
  });
});

describe("weekly email", () => {
  function mailOn() {
    process.env.RESEND_API_KEY = "re_test_key_123";
    process.env.EMAIL_FROM = "TradeOS <hello@example.com>";
  }
  it("is sent to the user when email is set up and the preference is on", async () => {
    on();
    mailOn();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const u = await makeUser();
    const r = await runWeeklyCoaching({ now: NOW });
    expect(r.emailed).toBeGreaterThanOrEqual(1);
    const mine = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body)).filter((b) => b.to === u.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Your weekly coaching review");
    expect(mine[0].html).toContain("&lt;b&gt;"); // escaped
    expect(mine[0].html).not.toContain("<b>");
    expect(mine[0].html).not.toContain("sk-test-not-real");
    expect(mine[0].html).not.toContain("re_test_key_123");
  });
  it("is not sent when email is not set up, or the preference is off", async () => {
    on();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const a = await makeUser();
    await runWeeklyCoaching({ now: NOW });
    expect(fetchMock.mock.calls.filter((c) => String(c[1]?.body).includes(a.email))).toHaveLength(0);

    mailOn();
    const b = await makeUser({ coachingWeeklyEmail: false });
    const r = await runWeeklyCoaching({ now: NOW });
    expect(await weeklyNotes(b.id)).toBe(1);
    expect(fetchMock.mock.calls.filter((c) => String(c[1]?.body).includes(b.email))).toHaveLength(0);
    expect(r.failed).toBe(0);
  });
});

describe("shouldRunWeeklyNow", () => {
  it("is true Monday from 06:00 ET only", () => {
    expect(shouldRunWeeklyNow(new Date("2026-10-12T10:30:00Z"))).toBe(true); // Mon 06:30 EDT
    expect(shouldRunWeeklyNow(new Date("2026-10-12T09:00:00Z"))).toBe(false); // Mon 05:00 EDT
    expect(shouldRunWeeklyNow(new Date("2026-10-11T14:00:00Z"))).toBe(false); // Sunday
    expect(shouldRunWeeklyNow(new Date("2026-10-13T14:00:00Z"))).toBe(false); // Tuesday
  });
});
