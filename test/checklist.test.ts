// Pre-trade checklist: zod on every input, cross-user isolation for templates
// and runs (through the REAL routes against the throwaway database), linking
// rules, the 4-hour suggestion window, and "never touches the score".

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

import { GET as listTemplatesRoute, POST as createTemplateRoute } from "@/app/api/checklists/route";
import { PATCH as patchTemplateRoute, DELETE as deleteTemplateRoute } from "@/app/api/checklists/[id]/route";
import { GET as listRunsRoute, POST as createRunRoute } from "@/app/api/checklists/runs/route";
import { PATCH as patchRunRoute, DELETE as deleteRunRoute } from "@/app/api/checklists/runs/[id]/route";
import { GET as suggestionRoute } from "@/app/api/checklists/suggestion/route";
import {
  buildAnswers,
  inSuggestionWindow,
  minutesBeforePhrase,
  parseAnswers,
  runCreateSchema,
  runPatchSchema,
  STARTER_ITEMS,
  templateCreateSchema,
  templatePatchSchema,
  tickedBeforeEntry,
} from "@/lib/checklist";
import { resetRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const stamp = Date.now();
const ENTRY = new Date("2026-07-06T14:00:00Z");

type Trader = {
  id: string;
  email: string;
  templateId: string;
  itemIds: string[];
  tradeId: string;
  runId: string;
};

async function makeTrader(label: string): Promise<Trader> {
  const user = await prisma.user.create({
    data: { email: `ck-${label}-${stamp}@example.com`, passwordHash: "x", displayName: label },
  });
  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, name: `${label} acct`, startingBalance: 50000 },
  });
  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      accountId: account.id,
      symbol: "MES",
      side: "long",
      entryPrice: 5000,
      exitPrice: 5001,
      quantity: 1,
      entryTime: ENTRY,
      exitTime: new Date("2026-07-06T15:00:00Z"),
      fees: 0,
      pnl: 5,
      source: "manual",
    },
  });
  const template = await prisma.checklistTemplate.create({
    data: {
      userId: user.id,
      name: `${label} list`,
      items: { create: [{ text: "One", order: 0 }, { text: "Two", order: 1 }] },
    },
    include: { items: true },
  });
  const run = await prisma.checklistRun.create({
    data: {
      userId: user.id,
      templateId: template.id,
      templateName: template.name,
      answers: JSON.stringify([{ text: "One", checked: true }, { text: "Two", checked: false }]),
      checkedCount: 1,
      totalCount: 2,
    },
  });
  return {
    id: user.id,
    email: user.email,
    templateId: template.id,
    itemIds: template.items.map((i) => i.id),
    tradeId: trade.id,
    runId: run.id,
  };
}

const as = (t: Trader | null) => {
  session.current = t ? { id: t.id, email: t.email, plan: "pro", billingStatus: "active" } : null;
};
const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api/checklists", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let alice: Trader;
let bob: Trader;

beforeAll(async () => {
  alice = await makeTrader("alice");
  bob = await makeTrader("bob");
});

beforeEach(() => {
  for (const t of [alice, bob]) {
    resetRateLimit(`checklists:write:user:${t.id}`);
    resetRateLimit(`checklists:read:user:${t.id}`);
  }
  as(null);
});

afterAll(async () => {
  for (const t of [alice, bob]) {
    if (!t) continue;
    await prisma.checklistRun.deleteMany({ where: { userId: t.id } });
    await prisma.checklistTemplate.deleteMany({ where: { userId: t.id } });
    await prisma.trade.deleteMany({ where: { userId: t.id } });
  }
  await prisma.$disconnect();
});

describe("signed out", () => {
  it("every checklist route refuses a signed-out request", async () => {
    const calls = [
      await listTemplatesRoute(),
      await createTemplateRoute(json("POST", {})),
      await patchTemplateRoute(json("PATCH", {}), ctx(alice.templateId)),
      await deleteTemplateRoute(json("DELETE"), ctx(alice.templateId)),
      await listRunsRoute(json("GET")),
      await createRunRoute(json("POST", {})),
      await patchRunRoute(json("PATCH", {}), ctx(alice.runId)),
      await deleteRunRoute(json("DELETE"), ctx(alice.runId)),
      await suggestionRoute(new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`)),
    ];
    for (const res of calls) expect(res.status).toBe(401);
  });
});

describe("zod rejects bad input", () => {
  it("templates: empty name, no items, too many items, too-long text, blank item", () => {
    const item = "Is my stop placed?";
    expect(templateCreateSchema.safeParse({ name: "Ok", items: [item] }).success).toBe(true);
    expect(templateCreateSchema.safeParse({ name: "", items: [item] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "   ", items: [item] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "x".repeat(61), items: [item] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: [] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: Array(21).fill(item) }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: Array(20).fill(item) }).success).toBe(true);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: ["x".repeat(141)] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: ["x".repeat(140)] }).success).toBe(true);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: ["  "] }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ name: "Ok", items: [42] }).success).toBe(false);
    expect(templatePatchSchema.safeParse({}).success).toBe(false);
    expect(templatePatchSchema.safeParse({ move: "sideways" }).success).toBe(false);
  });

  it("runs: missing template, bad ticked list, bad link", () => {
    expect(runCreateSchema.safeParse({ templateId: "", ticked: [] }).success).toBe(false);
    expect(runCreateSchema.safeParse({ templateId: "a", ticked: "all" }).success).toBe(false);
    expect(runCreateSchema.safeParse({ templateId: "a", ticked: Array(21).fill("x") }).success).toBe(false);
    expect(runCreateSchema.safeParse({ templateId: "a", ticked: [] }).success).toBe(true);
    expect(runPatchSchema.safeParse({}).success).toBe(false);
    expect(runPatchSchema.safeParse({ tradeId: 5 }).success).toBe(false);
    expect(runPatchSchema.safeParse({ tradeId: null }).success).toBe(true);
  });

  it("the routes answer 400 with a plain message, not a raw error", async () => {
    as(alice);
    const a = await createTemplateRoute(json("POST", { name: "", items: [] }));
    expect(a.status).toBe(400);
    expect((await a.json()).error).toBe("Please check the checklist name and questions.");
    const b = await createRunRoute(json("POST", { templateId: alice.templateId, ticked: "nope" }));
    expect(b.status).toBe(400);
    const c = await createRunRoute(new Request("http://localhost/x", { method: "POST", body: "not json" }));
    expect(c.status).toBe(400);
    const d = await listRunsRoute(new Request("http://localhost/api/checklists/runs?limit=9999"));
    expect(d.status).toBe(400);
  });
});

describe("the owner can use their own checklists (positive control)", () => {
  it("lists, reads runs, and sees the suggestion window rules", async () => {
    as(alice);
    const t = await (await listTemplatesRoute()).json();
    expect(t.templates.map((x: { id: string }) => x.id)).toContain(alice.templateId);
    expect(t.templates.every((x: { id: string }) => x.id !== bob.templateId)).toBe(true);
    const r = await (await listRunsRoute(json("GET"))).json();
    expect(r.runs.map((x: { id: string }) => x.id)).toEqual([alice.runId]);
  });

  it("a run keeps its own wording when the checklist is edited or deleted", async () => {
    as(alice);
    const created = await (
      await createTemplateRoute(json("POST", { name: "Temp", items: ["Old wording", "Second"] }))
    ).json();
    expect(created.ok).toBe(true);
    const tpl = created.template;
    const run = await (
      await createRunRoute(json("POST", { templateId: tpl.id, ticked: [tpl.items[0].id] }))
    ).json();
    expect(run.run.checkedCount).toBe(1);
    expect(run.run.totalCount).toBe(2);

    const edited = await patchTemplateRoute(
      json("PATCH", { name: "Renamed", items: ["New wording"] }),
      ctx(tpl.id)
    );
    expect(edited.status).toBe(200);
    const after = await (await listRunsRoute(json("GET"))).json();
    const saved = after.runs.find((x: { id: string }) => x.id === run.run.id);
    expect(saved.templateName).toBe("Temp");
    expect(saved.answers).toEqual([
      { text: "Old wording", checked: true },
      { text: "Second", checked: false },
    ]);

    await deleteTemplateRoute(json("DELETE"), ctx(tpl.id));
    const gone = await (await listRunsRoute(json("GET"))).json();
    const still = gone.runs.find((x: { id: string }) => x.id === run.run.id);
    expect(still.answers[0].text).toBe("Old wording");
    await deleteRunRoute(json("DELETE"), ctx(run.run.id));
  });

  it("moving a checklist up and down changes its place", async () => {
    as(alice);
    const second = await (await createTemplateRoute(json("POST", { name: "Second", items: ["x"] }))).json();
    let list = (await (await listTemplatesRoute()).json()).templates.map((x: { name: string }) => x.name);
    expect(list.slice(-1)).toEqual(["Second"]);
    await patchTemplateRoute(json("PATCH", { move: "up" }), ctx(second.template.id));
    list = (await (await listTemplatesRoute()).json()).templates.map((x: { name: string }) => x.name);
    expect(list.indexOf("Second")).toBeLessThan(list.indexOf("alice list"));
    await deleteTemplateRoute(json("DELETE"), ctx(second.template.id));
  });

  it("refuses an 11th checklist with a plain message", async () => {
    as(bob);
    const made: string[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await createTemplateRoute(json("POST", { name: `L${i}`, items: ["x"] }));
      if (res.status === 200) made.push((await res.json()).template.id);
      else {
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/10 checklists/);
      }
    }
    expect(made.length).toBe(9); // bob already had one
    for (const id of made) await deleteTemplateRoute(json("DELETE"), ctx(id));
  });
});

describe("cross-user isolation: templates", () => {
  it("B cannot read, change or delete A's checklist (404, A unchanged)", async () => {
    as(bob);
    const list = await (await listTemplatesRoute()).json();
    expect(list.templates.some((t: { id: string }) => t.id === alice.templateId)).toBe(false);

    const patch = await patchTemplateRoute(json("PATCH", { name: "hijacked" }), ctx(alice.templateId));
    expect(patch.status).toBe(404);
    const del = await deleteTemplateRoute(json("DELETE"), ctx(alice.templateId));
    expect(del.status).toBe(404);
    const row = await prisma.checklistTemplate.findUnique({ where: { id: alice.templateId } });
    expect(row?.name).toBe("alice list");
  });

  it("B cannot save a run against A's checklist", async () => {
    as(bob);
    const res = await createRunRoute(json("POST", { templateId: alice.templateId, ticked: alice.itemIds }));
    expect(res.status).toBe(404);
  });

  it("B cannot tie a checklist to A's rulebook", async () => {
    const book = await prisma.ruleBook.create({ data: { userId: alice.id, name: "alice book" } });
    as(bob);
    const res = await createTemplateRoute(json("POST", { name: "tie", items: ["x"], ruleBookId: book.id }));
    expect(res.status).toBe(404);
    await prisma.ruleBook.delete({ where: { id: book.id } });
  });
});

describe("cross-user isolation: runs", () => {
  it("B cannot list, link, unlink or delete A's run", async () => {
    as(bob);
    const list = await (await listRunsRoute(json("GET"))).json();
    expect(list.runs.some((r: { id: string }) => r.id === alice.runId)).toBe(false);

    expect((await patchRunRoute(json("PATCH", { tradeId: bob.tradeId }), ctx(alice.runId))).status).toBe(404);
    expect((await patchRunRoute(json("PATCH", { tradeId: null }), ctx(alice.runId))).status).toBe(404);
    expect((await deleteRunRoute(json("DELETE"), ctx(alice.runId))).status).toBe(404);
    expect(await prisma.checklistRun.count({ where: { id: alice.runId } })).toBe(1);
  });

  it("B cannot link B's run to A's trade, or A's run to B's trade", async () => {
    as(bob);
    const toAlicesTrade = await patchRunRoute(json("PATCH", { tradeId: alice.tradeId }), ctx(bob.runId));
    expect(toAlicesTrade.status).toBe(404);
    expect((await prisma.checklistRun.findUnique({ where: { id: bob.runId } }))?.tradeId).toBeNull();

    const aliceRunToBobsTrade = await patchRunRoute(json("PATCH", { tradeId: bob.tradeId }), ctx(alice.runId));
    expect(aliceRunToBobsTrade.status).toBe(404);
    expect((await prisma.checklistRun.findUnique({ where: { id: alice.runId } }))?.tradeId).toBeNull();
  });

  it("B cannot create a run that links to A's trade", async () => {
    as(bob);
    const res = await createRunRoute(
      json("POST", { templateId: bob.templateId, ticked: [], tradeId: alice.tradeId })
    );
    expect(res.status).toBe(404);
  });

  it("B cannot read A's trade suggestion or link state", async () => {
    as(bob);
    const res = await suggestionRoute(
      new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.linked).toBeUndefined();
    expect(body.suggestion).toBeUndefined();
  });
});

describe("linking rules and the 4-hour suggestion", () => {
  it("suggests a run saved up to 4 hours before entry and links only on the tap", async () => {
    as(alice);
    const run = await prisma.checklistRun.create({
      data: {
        userId: alice.id,
        templateName: "Near",
        answers: "[]",
        checkedCount: 0,
        totalCount: 0,
        createdAt: new Date(ENTRY.getTime() - 12 * 60000),
      },
    });
    const res = await suggestionRoute(
      new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`)
    );
    const body = await res.json();
    expect(body.linked).toBeNull();
    expect(body.suggestion.id).toBe(run.id); // the closest one, not the 'now' run
    expect((await prisma.checklistRun.findUnique({ where: { id: run.id } }))?.tradeId).toBeNull();

    const link = await patchRunRoute(json("PATCH", { tradeId: alice.tradeId }), ctx(run.id));
    expect(link.status).toBe(200);
    const after = await (
      await suggestionRoute(new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`))
    ).json();
    expect(after.linked.id).toBe(run.id);
    expect(after.suggestion).toBeNull();
    expect(after.linked.tradeLabel).toBe("MES long");

    // One run per trade: a second run cannot take the same trade.
    const second = await patchRunRoute(json("PATCH", { tradeId: alice.tradeId }), ctx(alice.runId));
    expect(second.status).toBe(409);
    const viaCreate = await createRunRoute(
      json("POST", { templateId: alice.templateId, ticked: [], tradeId: alice.tradeId })
    );
    expect(viaCreate.status).toBe(409);

    // Unlinking keeps the run.
    const unlink = await patchRunRoute(json("PATCH", { tradeId: null }), ctx(run.id));
    expect(unlink.status).toBe(200);
    expect(await prisma.checklistRun.count({ where: { id: run.id } })).toBe(1);
    await prisma.checklistRun.delete({ where: { id: run.id } });
  });

  it("does not suggest a run saved after entry or more than 4 hours before", async () => {
    as(alice);
    await prisma.checklistRun.deleteMany({ where: { userId: alice.id, id: { not: alice.runId } } });
    await prisma.checklistRun.update({
      where: { id: alice.runId },
      data: { createdAt: new Date(ENTRY.getTime() - 4 * 3600000 - 60000) },
    });
    const tooOld = await (
      await suggestionRoute(new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`))
    ).json();
    expect(tooOld.suggestion).toBeNull();

    await prisma.checklistRun.update({
      where: { id: alice.runId },
      data: { createdAt: new Date(ENTRY.getTime() + 60000) },
    });
    const after = await (
      await suggestionRoute(new Request(`http://localhost/api/checklists/suggestion?tradeId=${alice.tradeId}`))
    ).json();
    expect(after.suggestion).toBeNull();
  });

  it("deleting a trade keeps the run (it just comes unlinked)", async () => {
    const acct = await prisma.tradingAccount.findFirstOrThrow({ where: { userId: bob.id } });
    const trade = await prisma.trade.create({
      data: {
        userId: bob.id,
        accountId: acct.id,
        symbol: "ES",
        side: "short",
        entryPrice: 1,
        quantity: 1,
        entryTime: ENTRY,
        fees: 0,
        source: "manual",
      },
    });
    as(bob);
    const made = await (
      await createRunRoute(json("POST", { templateId: bob.templateId, ticked: [], tradeId: trade.id }))
    ).json();
    expect(made.run.tradeId).toBe(trade.id);
    await prisma.trade.delete({ where: { id: trade.id } });
    const row = await prisma.checklistRun.findUnique({ where: { id: made.run.id } });
    expect(row).not.toBeNull();
    expect(row?.tradeId).toBeNull();
  });
});

describe("pure helpers", () => {
  it("buildAnswers copies the wording and counts ticks; unknown ids are ignored", () => {
    const r = buildAnswers(
      [
        { id: "a", text: "One" },
        { id: "b", text: "Two" },
      ],
      ["a", "zzz"]
    );
    expect(r.answers).toEqual([
      { text: "One", checked: true },
      { text: "Two", checked: false },
    ]);
    expect(r.checkedCount).toBe(1);
    expect(r.totalCount).toBe(2);
  });

  it("parseAnswers never crashes on bad stored data", () => {
    expect(parseAnswers("not json")).toEqual([]);
    expect(parseAnswers('{"a":1}')).toEqual([]);
    expect(parseAnswers('[{"text":"x","checked":true},{"nope":1}]')).toEqual([{ text: "x", checked: true }]);
  });

  it("badge and window maths", () => {
    const entry = new Date("2026-07-06T14:00:00Z");
    expect(tickedBeforeEntry(new Date("2026-07-06T13:48:00Z"), entry)).toBe(true);
    expect(tickedBeforeEntry(new Date("2026-07-06T14:00:00Z"), entry)).toBe(true);
    expect(tickedBeforeEntry(new Date("2026-07-06T14:01:00Z"), entry)).toBe(false);
    expect(inSuggestionWindow(new Date("2026-07-06T10:00:00Z"), entry)).toBe(true);
    expect(inSuggestionWindow(new Date("2026-07-06T09:59:00Z"), entry)).toBe(false);
    expect(inSuggestionWindow(new Date("2026-07-06T14:00:01Z"), entry)).toBe(false);
    expect(minutesBeforePhrase(new Date("2026-07-06T13:48:00Z"), entry)).toBe("12 minutes before this entry");
    expect(minutesBeforePhrase(new Date("2026-07-06T12:55:00Z"), entry)).toBe("1 hour 5 minutes before this entry");
    expect(minutesBeforePhrase(new Date("2026-07-06T13:59:40Z"), entry)).toBe("just before this entry");
  });

  it("the starter checklist is five valid questions", () => {
    expect(STARTER_ITEMS).toHaveLength(5);
    expect(templateCreateSchema.safeParse({ name: "Starter checklist", items: [...STARTER_ITEMS] }).success).toBe(true);
  });
});

describe("the checklist never touches the score, the rules or a broker", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  }
  const root = process.cwd();
  const mine = [
    ...sourceFiles(join(root, "src/lib/checklist")),
    ...sourceFiles(join(root, "src/lib/sizing")),
    ...sourceFiles(join(root, "src/app/api/checklists")),
    ...sourceFiles(join(root, "src/components/checklist")),
    ...sourceFiles(join(root, "src/components/sizing")),
  ];

  it("no checklist or sizing code imports a broker connector, the rule engine or the score", () => {
    expect(mine.length).toBeGreaterThan(8);
    for (const f of mine) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from ["']@\/lib\/(connectors|rules|discipline)/);
      expect(src, f).not.toMatch(/placeOrder|submitOrder|cancelOrder|modifyOrder/i);
    }
  });

  it("the score and rule engine never read a checklist", () => {
    for (const rel of ["src/lib/discipline/score.ts", "src/lib/rules/engine.ts", "src/lib/rules/recompute.ts"]) {
      expect(readFileSync(join(root, rel), "utf8"), rel).not.toMatch(/checklist/i);
    }
  });
});
