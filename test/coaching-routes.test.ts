// Coaching routes through the REAL handlers against the throwaway database,
// with the model provider mocked: auth, cross-user isolation, focus rules,
// paging, profile prefs, export, usage secret, demo desk, Retry-After.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const { session, create } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
  create: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { GET as statusRoute } from "@/app/api/coaching/route";
import { GET as listNotes, POST as makeNote } from "@/app/api/coaching/notes/route";
import { DELETE as deleteNote } from "@/app/api/coaching/notes/[id]/route";
import { POST as feedbackRoute } from "@/app/api/coaching/notes/[id]/feedback/route";
import { GET as listFocus, POST as makeFocus } from "@/app/api/coaching/focus/route";
import { PATCH as patchFocus } from "@/app/api/coaching/focus/[id]/route";
import { GET as usageRoute } from "@/app/api/coaching/usage/route";
import { PATCH as profilePatch } from "@/app/api/profile/route";
import { GET as exportRoute } from "@/app/api/profile/export/route";
import { prisma } from "@/lib/db";
import { resetRateLimit } from "@/lib/rate-limit";
import { DEMO_EMAIL } from "@/lib/demo-desk";

const stamp = Date.now();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown, url = "http://localhost/api/coaching") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

type U = { id: string; email: string; tradeId: string };
let alice: U;
let bob: U;
const noteIds: Record<string, string> = {};

async function makeUser(label: string): Promise<U> {
  const email = `cr-${label}-${stamp}@example.com`;
  const u = await prisma.user.create({ data: { email, passwordHash: "x" } });
  const acct = await prisma.tradingAccount.create({ data: { userId: u.id, name: "a", startingBalance: 50000 } });
  const t = await prisma.trade.create({
    data: {
      userId: u.id, accountId: acct.id, symbol: "MES", side: "long", entryPrice: 1, exitPrice: 2, quantity: 1,
      entryTime: new Date("2026-10-07T14:00:00Z"), exitTime: new Date("2026-10-07T15:00:00Z"), pnl: 1, isWin: true,
    },
  });
  return { id: u.id, email, tradeId: t.id };
}
const as = (u: U | null, extra: Record<string, unknown> = {}) => {
  session.current = u ? { id: u.id, email: u.email, plan: "pro", billingStatus: "active", ...extra } : null;
};
const note = (userId: string, kind: string, content: unknown, subjectKey = "30d", createdAt?: Date) =>
  prisma.coachingNote.create({
    data: { userId, kind, subjectKey, inputHash: `h-${Math.random()}`, content: JSON.stringify(content), model: "m", source: "ai", ...(createdAt ? { createdAt } : {}) },
  });

const SUGG = { items: [{ title: "Keep size steady", body: "Stick to your rule.", priority: "high" }, { title: "Pause", body: "Breathe.", priority: "low" }] };
const SECRET_STRING = "SECRET-NOTE-CONTENT-XYZ";

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  noteIds.sugg = (await note(alice.id, "suggestions", SUGG)).id;
  noteIds.trade = (await note(alice.id, "trade", { tradeId: alice.tradeId, headline: SECRET_STRING, detail: "d" }, alice.tradeId)).id;
  noteIds.day = (await note(alice.id, "day", { date: "2026-10-09", summary: "s", wins: [], mistakes: [], focusTomorrow: "Stop at the cut-off." }, "2026-10-09")).id;
  noteIds.bob = (await note(bob.id, "suggestions", SUGG)).id;
});
beforeEach(() => {
  for (const u of [alice, bob]) {
    for (const a of ["coaching:read", "coaching:write", "coaching:generate", "profile:write"]) resetRateLimit(`${a}:user:${u.id}`);
  }
  create.mockReset();
  as(null);
  for (const k of ["AI_COACHING_ENABLED", "ANTHROPIC_API_KEY", "CRON_SECRET"]) delete process.env[k];
});
afterAll(async () => {
  await prisma.aiUsage.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `cr-` , endsWith: `-${stamp}@example.com` } } });
  await prisma.$disconnect();
});

describe("logged out", () => {
  it("answers 401 on every route", async () => {
    const calls: Promise<Response>[] = [
      statusRoute(),
      listNotes(req("GET")),
      makeNote(req("POST", { kind: "suggestions" })),
      deleteNote(req("DELETE"), ctx("x")),
      feedbackRoute(req("POST", { vote: "up" }), ctx("x")),
      listFocus(req("GET")),
      makeFocus(req("POST", {})),
      patchFocus(req("PATCH", {}), ctx("x")),
      profilePatch(req("PATCH", { coachingEnabled: true })),
      exportRoute(),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
  });
});

describe("generate", () => {
  it("another user's trade is 404 and the provider is not called", async () => {
    process.env.AI_COACHING_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    as(alice);
    const r = await makeNote(req("POST", { kind: "trade", tradeId: bob.tradeId }));
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe("not_found");
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects a bad body and a bad date", async () => {
    as(alice);
    expect((await makeNote(req("POST", { kind: "nope" }))).status).toBe(400);
    expect((await makeNote(req("POST", { kind: "day", date: "10/09/2026" }))).status).toBe(400);
  });
  it("owner switch off is 503 with the code", async () => {
    as(alice);
    const r = await makeNote(req("POST", { kind: "suggestions" }));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, code: "disabled" });
  });
  it("a 429 carries Retry-After", async () => {
    process.env.AI_COACHING_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.AI_DAILY_CAP_PRO = "1";
    try {
      await prisma.aiUsage.create({ data: { userId: alice.id, kind: "day" } });
      as(alice);
      const r = await makeNote(req("POST", { kind: "suggestions" }));
      expect(r.status).toBe(429);
      expect(r.headers.get("Retry-After")).toBe("3600");
      expect((await r.json()).code).toBe("limit");
      expect(create).not.toHaveBeenCalled();
    } finally {
      delete process.env.AI_DAILY_CAP_PRO;
      await prisma.aiUsage.deleteMany({ where: { userId: alice.id } });
    }
  });
});

describe("status", () => {
  it("never calls the provider and reports the desk", async () => {
    process.env.AI_COACHING_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    as(alice);
    const r = await statusRoute();
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(create).not.toHaveBeenCalled();
    expect(b).toMatchObject({ ok: true, switchedOn: true, userEnabled: true, demo: false, limit: 10, usedToday: 0, remaining: 10 });
    expect(b.latest.suggestions.id).toBe(noteIds.sugg);
    expect(b.latest.clusters).toBeNull();
    expect(b.preferences).toMatchObject({ tone: "gentle", focusAreas: [], weekly: true, weeklyEmail: true });
  });
});

describe("feedback and delete isolation", () => {
  it("another user's note is 404 on feedback and delete; own feedback sets and clears", async () => {
    as(alice);
    expect((await feedbackRoute(req("POST", { vote: "up" }), ctx(noteIds.bob))).status).toBe(404);
    expect((await deleteNote(req("DELETE"), ctx(noteIds.bob))).status).toBe(404);
    expect(await prisma.coachingNote.count({ where: { id: noteIds.bob } })).toBe(1);
    const up = await feedbackRoute(req("POST", { vote: "up" }), ctx(noteIds.sugg));
    expect(await up.json()).toEqual({ ok: true, feedback: "up" });
    expect((await prisma.coachingNote.findUnique({ where: { id: noteIds.sugg } }))?.feedbackAt).not.toBeNull();
    await feedbackRoute(req("POST", { vote: null }), ctx(noteIds.sugg));
    const row = await prisma.coachingNote.findUnique({ where: { id: noteIds.sugg } });
    expect(row?.feedback).toBeNull();
    expect(row?.feedbackAt).toBeNull();
    expect((await feedbackRoute(req("POST", { vote: "sideways" }), ctx(noteIds.sugg))).status).toBe(400);
  });
  it("deletes an own note", async () => {
    as(alice);
    const n = await note(alice.id, "clusters", { items: [] });
    expect((await deleteNote(req("DELETE"), ctx(n.id))).status).toBe(200);
    expect(await prisma.coachingNote.count({ where: { id: n.id } })).toBe(0);
  });
});

describe("focus", () => {
  beforeEach(async () => {
    await prisma.coachingFocus.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.checklistTemplate.deleteMany({ where: { userId: alice.id } });
  });

  it("another user's note is 404; trade note and bad path are 400", async () => {
    as(alice);
    expect((await makeFocus(req("POST", { noteId: noteIds.bob, path: "items.0" }))).status).toBe(404);
    expect((await makeFocus(req("POST", { noteId: noteIds.trade, path: "focus" }))).status).toBe(400);
    expect((await makeFocus(req("POST", { noteId: noteIds.sugg, path: "items.9" }))).status).toBe(400);
    expect((await makeFocus(req("POST", { noteId: noteIds.sugg, path: "items.0; drop" }))).status).toBe(400);
    expect((await makeFocus(req("POST", { noteId: noteIds.sugg, path: "focus" }))).status).toBe(400);
  });

  it("copies the text from the note, is idempotent, and patches status", async () => {
    as(alice);
    const r = await makeFocus(req("POST", { noteId: noteIds.sugg, path: "items.0", text: "ignored free text" }));
    expect(r.status).toBe(201);
    const { item } = await r.json();
    expect(item.text).toBe("Keep size steady — Stick to your rule.");
    expect(item.status).toBe("open");
    const again = await makeFocus(req("POST", { noteId: noteIds.sugg, path: "items.0" }));
    expect(again.status).toBe(200);
    expect((await again.json()).item.id).toBe(item.id);
    expect(await prisma.coachingFocus.count({ where: { userId: alice.id } })).toBe(1);

    expect((await patchFocus(req("PATCH", { status: "done" }), ctx(item.id))).status).toBe(200);
    const done = await prisma.coachingFocus.findUnique({ where: { id: item.id } });
    expect(done?.status).toBe("done");
    expect(done?.doneAt).not.toBeNull();
    // Still the same item on a repeat, whatever its status.
    expect((await makeFocus(req("POST", { noteId: noteIds.sugg, path: "items.0" }))).status).toBe(200);
    const list = await (await listFocus(req("GET", undefined, "http://localhost/api/coaching/focus?status=all"))).json();
    expect(list.items).toHaveLength(1);
    expect((await patchFocus(req("PATCH", { status: "bogus" }), ctx(item.id))).status).toBe(400);
    as(bob);
    expect((await patchFocus(req("PATCH", { status: "done" }), ctx(item.id))).status).toBe(404);
  });

  it("caps open items at 20 with focus_full", async () => {
    await prisma.coachingFocus.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({ userId: alice.id, noteKind: "day", text: `t${i}` })),
    });
    as(alice);
    const r = await makeFocus(req("POST", { noteId: noteIds.day, path: "focus" }));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("focus_full");
  });

  it("reopening a dismissed item is refused when 20 are already open", async () => {
    await prisma.coachingFocus.deleteMany({ where: { userId: alice.id } });
    const gone = await prisma.coachingFocus.create({
      data: { userId: alice.id, noteKind: "day", text: "old", status: "dismissed" },
    });
    await prisma.coachingFocus.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({ userId: alice.id, noteKind: "day", text: `r${i}` })),
    });
    as(alice);
    const r = await patchFocus(req("PATCH", { status: "open" }), ctx(gone.id));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("focus_full");
    await prisma.coachingFocus.deleteMany({ where: { userId: alice.id } });
  });

  it("addToChecklist: no_template, then added to the first active list, then full", async () => {
    as(alice);
    const none = await (await makeFocus(req("POST", { noteId: noteIds.day, path: "focus", addToChecklist: true }))).json();
    expect(none.checklist).toEqual({ added: false, reason: "no_template" });

    await prisma.coachingFocus.deleteMany({ where: { userId: alice.id } });
    await prisma.checklistTemplate.create({ data: { userId: alice.id, name: "Later", order: 5, items: { create: [{ text: "x", order: 0 }] } } });
    const first = await prisma.checklistTemplate.create({
      data: { userId: alice.id, name: "First", order: 1, items: { create: [{ text: "a", order: 0 }, { text: "b", order: 3 }] } },
    });
    const ok = await (await makeFocus(req("POST", { noteId: noteIds.day, path: "focus", addToChecklist: true }))).json();
    expect(ok.checklist).toEqual({ added: true });
    const items = await prisma.checklistItem.findMany({ where: { templateId: first.id }, orderBy: { order: "asc" } });
    expect(items).toHaveLength(3);
    expect(items[2]).toMatchObject({ text: "Stop at the cut-off.", order: 4 });

    await prisma.checklistItem.createMany({
      data: Array.from({ length: 17 }, (_, i) => ({ templateId: first.id, text: `f${i}`, order: 10 + i })),
    });
    await prisma.coachingFocus.deleteMany({ where: { userId: alice.id } });
    const full = await (await makeFocus(req("POST", { noteId: noteIds.day, path: "focus", addToChecklist: true }))).json();
    expect(full.checklist).toEqual({ added: false, reason: "full" });
  });
});

describe("notes list paging", () => {
  it("pages newest first with before, filters by subject and kind, rejects unknown cursor", async () => {
    const paged = await makeUser("pager");
    const base = Date.parse("2026-09-01T00:00:00Z");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await note(paged.id, "day", { date: "2026-09-0" + (i + 1) }, i < 2 ? "2026-09-01" : "2026-09-02", new Date(base + i * 1000))).id);
    }
    await note(paged.id, "clusters", { items: [] }, "30d", new Date(base + 99_000));
    as(paged);
    const url = (q: string) => `http://localhost/api/coaching/notes?${q}`;
    const p1 = await (await listNotes(req("GET", undefined, url("kind=day&limit=2")))).json();
    expect(p1.notes.map((n: { id: string }) => n.id)).toEqual([ids[4], ids[3]]);
    expect(p1.nextCursor).toBe(ids[3]);
    const p2 = await (await listNotes(req("GET", undefined, url(`kind=day&limit=2&before=${p1.nextCursor}`)))).json();
    expect(p2.notes.map((n: { id: string }) => n.id)).toEqual([ids[2], ids[1]]);
    const p3 = await (await listNotes(req("GET", undefined, url(`kind=day&limit=2&before=${p2.nextCursor}`)))).json();
    expect(p3.notes.map((n: { id: string }) => n.id)).toEqual([ids[0]]);
    expect(p3.nextCursor).toBeNull();
    const sub = await (await listNotes(req("GET", undefined, url("subject=2026-09-01")))).json();
    expect(sub.notes).toHaveLength(2);
    expect((await listNotes(req("GET", undefined, url(`before=${noteIds.bob}`)))).status).toBe(400);
    expect((await listNotes(req("GET", undefined, url("limit=51")))).status).toBe(400);
  });
});

describe("profile preferences", () => {
  it("rejects unknown tone and area, stores areas deduped, empty clears", async () => {
    as(alice);
    expect((await profilePatch(req("PATCH", { coachingTone: "sarcastic" }))).status).toBe(400);
    expect((await profilePatch(req("PATCH", { coachingFocusAreas: ["rules", "gossip"] }))).status).toBe(400);
    expect((await profilePatch(req("PATCH", {}))).status).toBe(400);
    const ok = await profilePatch(
      req("PATCH", { coachingTone: "direct", coachingFocusAreas: ["sizing", "rules", "sizing"], coachingWeekly: false, coachingWeeklyEmail: false, coachingEnabled: true })
    );
    expect(ok.status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: alice.id } });
    expect(row).toMatchObject({ coachingTone: "direct", coachingWeekly: false, coachingWeeklyEmail: false });
    expect(JSON.parse(row!.coachingFocusAreas!)).toEqual(["rules", "sizing"]);
    await profilePatch(req("PATCH", { coachingFocusAreas: [] }));
    expect((await prisma.user.findUnique({ where: { id: alice.id } }))?.coachingFocusAreas).toBeNull();
  });
});

describe("export", () => {
  it("includes coachingNotes (no inputHash) and coachingFocus, own data only", async () => {
    as(alice);
    await prisma.coachingFocus.deleteMany({ where: { userId: alice.id } });
    await prisma.coachingFocus.create({ data: { userId: alice.id, noteId: noteIds.day, noteKind: "day", text: "Stop at the cut-off." } });
    resetRateLimit(`export:${alice.id}`);
    const b = await (await exportRoute()).json();
    expect(b.coachingNotes.map((n: { id: string }) => n.id)).toContain(noteIds.sugg);
    expect(b.coachingNotes.map((n: { id: string }) => n.id)).not.toContain(noteIds.bob);
    expect(b.coachingNotes[0].content).toBeTypeOf("object");
    expect(JSON.stringify(b.coachingNotes)).not.toContain("inputHash");
    expect(b.coachingFocus).toHaveLength(1);
  });
});

describe("usage", () => {
  const get = (auth?: string) =>
    usageRoute(new Request("http://localhost/api/coaching/usage", { headers: auth ? { authorization: auth } : {} }));
  it("503 when no secret, 401 on a wrong one, 200 with counts only", async () => {
    expect((await get("Bearer x")).status).toBe(503);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    await prisma.aiUsage.create({ data: { userId: alice.id, kind: "day", inputTokens: 1_000_000, outputTokens: 100_000 } });
    await prisma.aiUsage.create({ data: { userId: alice.id, kind: "weekly", ok: false, scheduled: true } });
    const r = await get("Bearer s3cret-value");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(SECRET_STRING);
    expect(text).not.toContain("Keep size steady");
    const b = JSON.parse(text);
    expect(b.days).toHaveLength(14);
    expect(b.days[13].day).toBe(new Date().toISOString().slice(0, 10));
    expect(b.pricing).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
    expect(b.totals.calls).toBeGreaterThanOrEqual(2);
    expect(b.totals.failed).toBeGreaterThanOrEqual(1);
    expect(b.totals.estimatedCostUsd).toBeGreaterThanOrEqual(4.5);
    expect(b.days[13].scheduled).toBeGreaterThanOrEqual(1);
    await prisma.aiUsage.deleteMany({ where: { userId: alice.id } });
  });
});

describe("usage history", () => {
  it("a 10-day-old row shows in its day bucket", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    const when = new Date(Date.now() - 10 * 86_400_000);
    await prisma.aiUsage.create({ data: { userId: alice.id, kind: "day", createdAt: when } });
    const r = await usageRoute(
      new Request("http://localhost/api/coaching/usage", { headers: { authorization: "Bearer s3cret-value" } })
    );
    const b = await r.json();
    const bucket = b.days.find((d: { day: string }) => d.day === when.toISOString().slice(0, 10));
    expect(bucket.calls).toBeGreaterThanOrEqual(1);
    await prisma.aiUsage.deleteMany({ where: { userId: alice.id } });
  });
});

describe("demo desk", () => {
  const demo = { id: "demo-user-id", email: DEMO_EMAIL, plan: "pro", billingStatus: "active" };
  it("sees samples on GET and gets 403 demo on POST, without the model", async () => {
    session.current = demo;
    const s = await (await statusRoute()).json();
    expect(s).toMatchObject({ ok: true, demo: true, userEnabled: true });
    expect(s.latest.suggestions.source).toBe("demo");
    expect(s.openFocus).toHaveLength(1);
    const n = await (await listNotes(req("GET", undefined, "http://localhost/api/coaching/notes?kind=day"))).json();
    expect(n.notes).toHaveLength(1);
    expect(n.nextCursor).toBeNull();
    expect((await (await listFocus(req("GET"))).json()).items).toHaveLength(1);
    const p = await makeNote(req("POST", { kind: "suggestions" }));
    expect(p.status).toBe(403);
    expect((await p.json()).code).toBe("demo");
    expect(create).not.toHaveBeenCalled();
  });
});
