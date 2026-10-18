// AI coaching service: plan caps, cache, scheduled runs, payload privacy, usage rows.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { prisma } from "@/lib/db";
import { generateCoachingNote, type CoachingUser } from "@/lib/ai/service";
import { coachingDailyCapFor, FOCUS_AREA_LABELS, TONE_LINES } from "@/lib/ai/limits";
import { toNoteDTO, focusTextFromNote } from "@/lib/ai/notes";
import { demoNotes, demoFocus } from "@/lib/ai/demo";

const NOW = new Date("2026-10-14T16:00:00Z"); // Wednesday; last full week starts 2026-10-05
const stamp = Date.now();

const USAGE = { input_tokens: 111, output_tokens: 22 };
const reply = (json: unknown) => ({ content: [{ type: "text", text: JSON.stringify(json) }], usage: USAGE });
const SUGGESTIONS = [{ title: "Keep size steady", body: "Stick to your size rule.", priority: "high" }];
const WEEK = {
  summary: "A steady week.",
  wins: ["Kept the loss limit"],
  mistakes: ["One late entry"],
  focusNextWeek: "Stop at your cut-off.",
  previousFocusVerdict: null,
};

const ENV = [
  "AI_COACHING_ENABLED", "ANTHROPIC_API_KEY", "AI_MODEL", "AI_DAILY_CAP_PER_USER", "AI_DAILY_CAP_GLOBAL",
  "AI_DAILY_CAP_FREE", "AI_DAILY_CAP_PRO", "AI_DAILY_CAP_ELITE", "AI_CACHE_HOURS",
];
function on() {
  process.env.AI_COACHING_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
}

let n = 0;
async function makeUser(extra: Record<string, unknown> = {}, withTrades = true) {
  n += 1;
  const email = `cs-${stamp}-${n}@example.com`;
  const u = await prisma.user.create({ data: { email, passwordHash: "x", ...extra } });
  const acct = await prisma.tradingAccount.create({ data: { userId: u.id, name: "acct", startingBalance: 50000 } });
  const ids: string[] = [];
  if (withTrades) {
    for (const day of ["2026-10-07", "2026-10-13"]) {
      for (const hour of [14, 16]) {
        const t = await prisma.trade.create({
          data: {
            userId: u.id, accountId: acct.id, symbol: "ZZSYMBOL", side: "long", entryPrice: 100, exitPrice: 101,
            quantity: 1, entryTime: new Date(`${day}T${hour}:00:00Z`), exitTime: new Date(`${day}T${hour}:30:00Z`),
            pnl: 25, isWin: true, notes: "PLANTED-JOURNAL-NOTE", whyEntered: "PLANTED-WHY", emotions: "planted-fomo",
          },
        });
        ids.push(t.id);
      }
    }
    const book = await prisma.ruleBook.create({ data: { userId: u.id, name: "PLANTED-BOOK" } });
    await prisma.rule.create({
      data: { ruleBookId: book.id, name: "PLANTED-RULE-NAME", type: "max_trades", config: JSON.stringify({ maxPerDay: 1 }) },
    });
  }
  const user: CoachingUser = { id: u.id, email, plan: "pro", billingStatus: "active" };
  return { user, tradeIds: ids, accountId: acct.id };
}

beforeEach(async () => {
  for (const k of ENV) delete process.env[k];
  create.mockReset();
  await prisma.aiUsage.deleteMany();
});
afterAll(async () => {
  await prisma.aiUsage.deleteMany();
  await prisma.user.deleteMany({ where: { email: { startsWith: `cs-${stamp}-` } } });
  await prisma.$disconnect();
});

describe("per-plan caps", () => {
  it("defaults to 3 / 10 / 25, trial gets Pro, canceled falls to free", () => {
    expect(coachingDailyCapFor("free", "active")).toBe(3);
    expect(coachingDailyCapFor("pro", "active")).toBe(10);
    expect(coachingDailyCapFor("elite", "active")).toBe(25);
    expect(coachingDailyCapFor("free", "trialing")).toBe(10);
    expect(coachingDailyCapFor("elite", "canceled")).toBe(3);
  });
  it("reads the plan env vars (0 allowed) and treats AI_DAILY_CAP_PER_USER as a ceiling only when set", () => {
    process.env.AI_DAILY_CAP_FREE = "0";
    process.env.AI_DAILY_CAP_PRO = "7";
    expect(coachingDailyCapFor("free", "active")).toBe(0);
    expect(coachingDailyCapFor("pro", "active")).toBe(7);
    process.env.AI_DAILY_CAP_PER_USER = "5";
    expect(coachingDailyCapFor("pro", "active")).toBe(5);
    expect(coachingDailyCapFor("elite", "active")).toBe(5);
    expect(coachingDailyCapFor("free", "active")).toBe(0);
  });
});

describe("refusals before any call", () => {
  it("owner switch off: disabled, no call", async () => {
    const { user } = await makeUser();
    const r = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(r).toMatchObject({ ok: false, code: "disabled", status: 503 });
    expect(create).not.toHaveBeenCalled();
  });
  it("user switched off: user_off", async () => {
    on();
    const { user } = await makeUser({ coachingEnabled: false });
    expect(await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW })).toMatchObject({ code: "user_off", status: 403 });
    expect(create).not.toHaveBeenCalled();
  });
  it("plan cap of 0: plan 403", async () => {
    on();
    process.env.AI_DAILY_CAP_FREE = "0";
    const { user } = await makeUser();
    const r = await generateCoachingNote({ ...user, plan: "free", billingStatus: "active" }, { kind: "suggestions" }, { now: NOW });
    expect(r).toMatchObject({ ok: false, code: "plan", status: 403, error: "AI coaching isn't included in your plan." });
    expect(create).not.toHaveBeenCalled();
  });
  it("no trades: no_data 422", async () => {
    on();
    const { user } = await makeUser({}, false);
    expect(await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW })).toMatchObject({ code: "no_data", status: 422 });
    expect(create).not.toHaveBeenCalled();
  });
  it("bad day inputs: bad_request; future day too", async () => {
    on();
    const { user } = await makeUser();
    expect(await generateCoachingNote(user, { kind: "day", date: "2026-02-30" }, { now: NOW })).toMatchObject({ code: "bad_request", status: 400 });
    expect(await generateCoachingNote(user, { kind: "day", date: "2026-10-20" }, { now: NOW })).toMatchObject({ code: "bad_request" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("call, usage row and cache", () => {
  it("saves the note and updates the usage row with kind and tokens", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user } = await makeUser();
    const r = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cached).toBe(false);
    expect(r.note.content).toEqual({ items: SUGGESTIONS });
    expect(r.usage).toEqual({ used: 1, limit: 10 });
    const rows = await prisma.aiUsage.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "suggestions", inputTokens: 111, outputTokens: 22, ok: true, scheduled: false });
  });
  it("a repeat is served from the saved note: no call, no usage row, servedCount bumps", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user } = await makeUser();
    const first = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    const second = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.ok && second.cached).toBe(true);
    expect(first.ok && second.ok && first.note.id === second.note.id).toBe(true);
    expect(await prisma.aiUsage.count({ where: { userId: user.id } })).toBe(1);
    const saved = await prisma.coachingNote.findMany({ where: { userId: user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0].servedCount).toBe(1);
  });
  it("a note deleted before the served-count bump falls through to a fresh generation", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user } = await makeUser();
    await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    create.mockClear();
    const real = prisma.coachingNote.updateMany.bind(prisma.coachingNote);
    let first = true;
    const spy = vi.spyOn(prisma.coachingNote, "updateMany").mockImplementation((async (args: never) => {
      if (first) {
        first = false;
        await prisma.coachingNote.deleteMany({ where: { userId: user.id } }); // gone before the bump
        return { count: 0 };
      }
      return real(args);
    }) as unknown as typeof real);
    const r = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(r.ok && r.cached).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await prisma.coachingNote.count({ where: { userId: user.id } })).toBe(1);
    spy.mockImplementation(real as never); // back to normal for later tests
  });
  it("a simultaneous request that saved the same note during the model call is reused", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user } = await makeUser();
    await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    const first = await prisma.coachingNote.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.coachingNote.deleteMany({ where: { userId: user.id } });
    create.mockReset();
    create.mockImplementation(async () => {
      await prisma.coachingNote.create({
        data: {
          userId: user.id, kind: first.kind, subjectKey: first.subjectKey, inputHash: first.inputHash,
          content: first.content, model: first.model, source: "ai",
        },
      });
      return reply(SUGGESTIONS);
    });
    const r = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok && r.cached).toBe(true);
    expect(await prisma.coachingNote.count({ where: { userId: user.id } })).toBe(1);
  });
  it("a changed fact produces a new call", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user, accountId } = await makeUser();
    await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    await prisma.trade.create({
      data: {
        userId: user.id, accountId, symbol: "ZZSYMBOL", side: "long", entryPrice: 100, exitPrice: 99, quantity: 1,
        entryTime: new Date("2026-10-13T18:00:00Z"), exitTime: new Date("2026-10-13T18:30:00Z"), pnl: -25, isWin: false,
      },
    });
    const r = await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW });
    expect(r.ok && r.cached).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("a failed or invalid answer marks the usage row not ok", async () => {
    on();
    create.mockResolvedValue({ content: [{ type: "text", text: "nope" }], usage: USAGE });
    const { user } = await makeUser();
    expect(await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW })).toMatchObject({ code: "unavailable", status: 502 });
    const rows = await prisma.aiUsage.findMany({ where: { userId: user.id } });
    expect(rows[0].ok).toBe(false);
    expect(await prisma.coachingNote.count({ where: { userId: user.id } })).toBe(0);
  });
  it("the user's daily cap is enforced", async () => {
    on();
    process.env.AI_DAILY_CAP_PRO = "1";
    create.mockResolvedValue(reply(SUGGESTIONS));
    const { user } = await makeUser();
    expect((await generateCoachingNote(user, { kind: "suggestions" }, { now: NOW })).ok).toBe(true);
    const r = await generateCoachingNote(user, { kind: "clusters" }, { now: NOW });
    expect(r).toMatchObject({ ok: false, code: "limit", status: 429 });
  });
});

describe("isolation and caps end to end", () => {
  const trade = { headline: "Followed your plan", detail: "Size was fine." };
  it("two users with identical facts never share a note", async () => {
    on();
    create.mockResolvedValue(reply(SUGGESTIONS));
    const a = await makeUser();
    const b = await makeUser();
    const ra = await generateCoachingNote(a.user, { kind: "suggestions" }, { now: NOW });
    const rb = await generateCoachingNote(b.user, { kind: "suggestions" }, { now: NOW });
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(rb.cached).toBe(false);
    expect(rb.note.id).not.toBe(ra.note.id);
    expect(create).toHaveBeenCalledTimes(2);
    expect(await prisma.coachingNote.count({ where: { userId: b.user.id } })).toBe(1);
  });
  it("a free user is refused on the 4th note; an elite user still gets theirs", async () => {
    on();
    create.mockResolvedValue(reply(trade));
    const free = await makeUser();
    const elite = await makeUser();
    const fu = { ...free.user, plan: "free", billingStatus: "active" };
    const eu = { ...elite.user, plan: "elite", billingStatus: "active" };
    for (let i = 0; i < 3; i++) {
      expect((await generateCoachingNote(fu, { kind: "trade", tradeId: free.tradeIds[i] }, { now: NOW })).ok).toBe(true);
    }
    expect(await generateCoachingNote(fu, { kind: "trade", tradeId: free.tradeIds[3] }, { now: NOW })).toMatchObject({
      ok: false, code: "limit", status: 429,
    });
    for (let i = 0; i < 4; i++) {
      expect((await generateCoachingNote(eu, { kind: "trade", tradeId: elite.tradeIds[i] }, { now: NOW })).ok).toBe(true);
    }
  });
  it("8 simultaneous requests at a cap of 3 let through at most 3", async () => {
    on();
    process.env.AI_DAILY_CAP_PRO = "3";
    create.mockResolvedValue(reply(trade));
    const a = await makeUser();
    for (let i = 0; i < 4; i++) {
      const t = await prisma.trade.create({
        data: {
          userId: a.user.id, accountId: a.accountId, symbol: "ZZSYMBOL", side: "long", entryPrice: 100, exitPrice: 101,
          quantity: 1, entryTime: new Date(`2026-10-08T${10 + i}:00:00Z`), exitTime: new Date(`2026-10-08T${10 + i}:30:00Z`),
          pnl: 25, isWin: true,
        },
      });
      a.tradeIds.push(t.id);
    }
    const results = await Promise.all(
      a.tradeIds.map((id) => generateCoachingNote(a.user, { kind: "trade", tradeId: id }, { now: NOW }))
    );
    expect(results).toHaveLength(8);
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(3);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "limit")).toBe(true);
    expect(await prisma.coachingNote.count({ where: { userId: a.user.id } })).toBeLessThanOrEqual(3);
  });
});

describe("scheduled runs and the weekly note", () => {
  it("dailyCap null skips the user gate but not the global one", async () => {
    on();
    process.env.AI_DAILY_CAP_PRO = "1";
    create.mockResolvedValue(reply(WEEK));
    const { user } = await makeUser();
    await prisma.aiUsage.create({ data: { userId: user.id } });
    await prisma.aiUsage.create({ data: { userId: user.id } });
    const r = await generateCoachingNote(user, { kind: "weekly" }, { scheduled: true, now: NOW });
    expect(r.ok).toBe(true);
    const row = await prisma.aiUsage.findFirst({ where: { userId: user.id, scheduled: true } });
    expect(row).toMatchObject({ kind: "weekly", inputTokens: 111, ok: true });
    // not charged to the user's daily count
    if (r.ok) expect(r.usage.used).toBe(2);
    // global gate still applies
    process.env.AI_DAILY_CAP_GLOBAL = "2";
    const other = await makeUser();
    const g = await generateCoachingNote(other.user, { kind: "weekly" }, { scheduled: true, now: NOW });
    expect(g).toMatchObject({ ok: false, code: "global_limit", status: 429 });
  });
  it("summarizeWeek: a finished week works, 700 tokens, Monday key, shape saved", async () => {
    on();
    create.mockResolvedValue(reply(WEEK));
    const { user } = await makeUser();
    const r = await generateCoachingNote(user, { kind: "weekly", weekStart: "2026-10-07" }, { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.note.subjectKey).toBe("2026-10-05"); // normalised to the Monday
    expect(r.note.content).toEqual({ weekStart: "2026-10-05", ...WEEK });
    expect(create.mock.calls[0][0].max_tokens).toBe(700);
  });
  it("on demand the current or a future week is week_open; scheduled always takes last week", async () => {
    on();
    create.mockResolvedValue(reply(WEEK));
    const { user } = await makeUser();
    expect(await generateCoachingNote(user, { kind: "weekly", weekStart: "2026-10-14" }, { now: NOW })).toMatchObject({
      code: "week_open", status: 422, error: "That week isn't finished yet.",
    });
    expect(await generateCoachingNote(user, { kind: "weekly", weekStart: "2026-11-02" }, { now: NOW })).toMatchObject({ code: "week_open" });
    expect(create).not.toHaveBeenCalled();
    const s = await generateCoachingNote(user, { kind: "weekly", weekStart: "2026-10-12" }, { scheduled: true, now: NOW });
    expect(s.ok && s.note.subjectKey).toBe("2026-10-05");
  });
});

describe("trade and day kinds", () => {
  it("another user's trade is not_found and makes no call", async () => {
    on();
    const a = await makeUser();
    const b = await makeUser();
    const r = await generateCoachingNote(b.user, { kind: "trade", tradeId: a.tradeIds[0] }, { now: NOW });
    expect(r).toMatchObject({ ok: false, code: "not_found", status: 404 });
    expect(create).not.toHaveBeenCalled();
  });
  it("explains the user's own trade", async () => {
    on();
    create.mockResolvedValue(reply({ headline: "Followed your plan", detail: "Size was fine." }));
    const a = await makeUser();
    const r = await generateCoachingNote(a.user, { kind: "trade", tradeId: a.tradeIds[0] }, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.note.content).toEqual({ tradeId: a.tradeIds[0], headline: "Followed your plan", detail: "Size was fine." });
  });
  it("summarises a day", async () => {
    on();
    create.mockResolvedValue(reply({ summary: "ok", wins: [], mistakes: [], focusTomorrow: "Stay calm." }));
    const a = await makeUser();
    const r = await generateCoachingNote(a.user, { kind: "day", date: "2026-10-13" }, { now: NOW });
    expect(r.ok && r.note.content.date).toBe("2026-10-13");
  });
});

describe("what is sent", () => {
  it("sends fixed labels and the coach's own previous focus, and nothing a user typed", async () => {
    on();
    create.mockResolvedValue(reply({ summary: "ok", wins: [], mistakes: [], focusTomorrow: "Stay calm." }));
    const a = await makeUser({
      displayName: "PLANTED-NAME",
      coachingTone: "direct",
      coachingFocusAreas: JSON.stringify(["sizing", "journaling"]),
    });
    await prisma.coachingFocus.create({
      data: { userId: a.user.id, noteKind: "day", text: "Close the platform at your cut-off." },
    });
    await generateCoachingNote(a.user, { kind: "day", date: "2026-10-13" }, { now: NOW });
    expect(create).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(create.mock.calls[0][0]);
    for (const bad of [
      a.user.email, a.user.id, "ZZSYMBOL", "PLANTED-RULE-NAME", "PLANTED-BOOK", "PLANTED-JOURNAL-NOTE",
      "PLANTED-WHY", "planted-fomo", "PLANTED-NAME", "sk-test-not-real",
    ]) {
      expect(sent, bad).not.toContain(bad);
    }
    expect(sent).toContain("Rule 1");
    expect(sent).toContain(TONE_LINES.direct);
    expect(sent).toContain(FOCUS_AREA_LABELS.sizing);
    expect(sent).toContain(FOCUS_AREA_LABELS.journaling);
    expect(sent).not.toContain(FOCUS_AREA_LABELS.rules);
    expect(sent).toContain("Close the platform at your cut-off.");
    expect(sent).toContain("previousFocus");
  });
});

describe("note helpers and demo samples", () => {
  it("toNoteDTO parses content and dates", () => {
    const dto = toNoteDTO({
      id: "n1", kind: "day", subjectKey: "2026-10-13", content: JSON.stringify({ a: 1 }), source: "ai",
      feedback: "up", createdAt: new Date("2026-10-14T00:00:00Z"),
    });
    expect(dto).toEqual({
      id: "n1", kind: "day", subjectKey: "2026-10-13", content: { a: 1 }, source: "ai", feedback: "up",
      createdAt: "2026-10-14T00:00:00.000Z",
    });
  });
  it("focusTextFromNote copies the text for allowed pairs and refuses the rest", () => {
    const sugg = { items: [{ title: "T", body: "B", priority: "low" }] };
    expect(focusTextFromNote(sugg, "suggestions", "items.0")).toBe("T — B");
    expect(focusTextFromNote(sugg, "suggestions", "items.1")).toBeNull();
    expect(focusTextFromNote(sugg, "suggestions", "focus")).toBeNull();
    expect(focusTextFromNote({ items: [{ label: "L", count: 2, suggestion: "S" }] }, "clusters", "items.0")).toBe("S");
    expect(
      focusTextFromNote({ date: "2026-10-13", summary: "s", wins: [], mistakes: [], focusTomorrow: "F" }, "day", "focus")
    ).toBe("F");
    expect(focusTextFromNote(WEEK && { weekStart: "2026-10-05", ...WEEK }, "weekly", "focus")).toBe(WEEK.focusNextWeek);
    expect(focusTextFromNote({ tradeId: "t", headline: "h", detail: "d" }, "trade", "focus")).toBeNull();
    expect(focusTextFromNote("not json", "day", "focus")).toBeNull();
  });
  it("demo samples cover every kind with demo ids and no model call", () => {
    const notes = demoNotes();
    expect(notes.map((x) => x.id).sort()).toEqual(
      ["demo-clusters", "demo-day", "demo-suggestions", "demo-trade", "demo-weekly"]
    );
    expect(notes.every((x) => x.source === "demo")).toBe(true);
    expect(demoFocus().length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });
});
