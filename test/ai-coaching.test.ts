// AI coaching provider: switch logic, daily caps, safe failure, minimal data.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
const ctorArgs = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(opts: unknown) {
      ctorArgs.last = opts;
    }
  },
}));

import { prisma } from "@/lib/db";
import { getCoachingProvider, isCoachingEnabled } from "@/lib/ai";
import type { CoachingContext } from "@/lib/ai";

const ok = (json: unknown) => ({ content: [{ type: "text", text: JSON.stringify(json) }] });
const SUGGESTIONS = [{ title: "Keep size steady", body: "Stick to your size rule.", priority: "high" }];

function ctx(userId: string): CoachingContext {
  return {
    userId,
    trades: [],
    metrics: { tradeCount: 5, winCount: 3, lossCount: 2, currentStreak: 2 } as never,
    discipline: {
      overall: 80, ruleAdherence: 70, riskDiscipline: 90, emotionalDiscipline: 80,
      consistency: 75, ruleChecks: 10, scored: true, breakdown: [],
    },
    violations: [
      { ruleName: "Max size", explanation: "secret@example.com traded EURUSD", severity: "high" },
    ],
    timeframe: { from: new Date("2026-10-01"), to: new Date("2026-10-08") },
  };
}

const ENV = ["AI_COACHING_ENABLED", "ANTHROPIC_API_KEY", "AI_MODEL", "AI_DAILY_CAP_PER_USER", "AI_DAILY_CAP_GLOBAL"];
function on() {
  process.env.AI_COACHING_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
}

beforeEach(async () => {
  for (const k of ENV) delete process.env[k];
  create.mockReset();
  await prisma.aiUsage.deleteMany();
});
afterAll(async () => {
  await prisma.aiUsage.deleteMany();
  await prisma.$disconnect();
});

describe("AI switch", () => {
  it("is off when AI_COACHING_ENABLED is missing", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(isCoachingEnabled()).toBe(false);
    const r = await getCoachingProvider().suggestImprovements(ctx("u1"));
    expect(r.enabled).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it("is off when ANTHROPIC_API_KEY is missing", () => {
    process.env.AI_COACHING_ENABLED = "true";
    expect(isCoachingEnabled()).toBe(false);
    expect(getCoachingProvider().enabled).toBe(false);
  });
  it("is on when both are set", async () => {
    on();
    create.mockResolvedValue(ok(SUGGESTIONS));
    expect(isCoachingEnabled()).toBe(true);
    const r = await getCoachingProvider().suggestImprovements(ctx("u1"));
    expect(r.enabled).toBe(true);
    expect(r.data?.[0].title).toBe("Keep size steady");
    expect(await prisma.aiUsage.count({ where: { userId: "u1" } })).toBe(1);
  });
});

describe("model, timeout and payload", () => {
  it("uses the default model, then AI_MODEL override", async () => {
    on();
    create.mockResolvedValue(ok(SUGGESTIONS));
    await getCoachingProvider().suggestImprovements(ctx("u1"));
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
    expect(create.mock.calls[0][0].max_tokens).toBeLessThanOrEqual(500);
    expect((ctorArgs.last as { timeout: number }).timeout).toBe(20_000);
    process.env.AI_MODEL = "claude-test-model";
    await getCoachingProvider().suggestImprovements(ctx("u1"));
    expect(create.mock.calls[1][0].model).toBe("claude-test-model");
  });
  it("sends no email, name, symbol, explanation text or key", async () => {
    on();
    create.mockResolvedValue(ok(SUGGESTIONS));
    await getCoachingProvider().suggestImprovements(ctx("user-id-123"));
    const sent = JSON.stringify(create.mock.calls[0][0]);
    for (const bad of ["secret@example.com", "EURUSD", "user-id-123", "sk-test-not-real"]) {
      expect(sent).not.toContain(bad);
    }
    // Custom rule names never leave the server; rules go as anonymous labels.
    expect(sent).not.toContain("Max size");
    expect(sent).toContain("Rule 1");
    expect(sent).toMatch(/never|NEVER/);
  });
});

describe("daily caps", () => {
  it("enforces the per-user cap and does not call the provider when over", async () => {
    on();
    process.env.AI_DAILY_CAP_PER_USER = "2";
    create.mockResolvedValue(ok(SUGGESTIONS));
    const p = getCoachingProvider();
    await p.suggestImprovements(ctx("u1"));
    await p.suggestImprovements(ctx("u1"));
    const third = await p.suggestImprovements(ctx("u1"));
    expect(third.data).toBeNull();
    expect(third.message).toMatch(/limit/i);
    expect(create).toHaveBeenCalledTimes(2);
    expect(await prisma.aiUsage.count({ where: { userId: "u1" } })).toBe(2);
    // another user is unaffected
    expect((await p.suggestImprovements(ctx("u2"))).data).not.toBeNull();
  });
  it("enforces the app-wide cap", async () => {
    on();
    process.env.AI_DAILY_CAP_GLOBAL = "2";
    create.mockResolvedValue(ok(SUGGESTIONS));
    const p = getCoachingProvider();
    await p.suggestImprovements(ctx("a"));
    await p.suggestImprovements(ctx("b"));
    const r = await p.suggestImprovements(ctx("c"));
    expect(r.data).toBeNull();
    expect(r.message).toMatch(/busy|paused/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("ignores usage older than 24 hours", async () => {
    on();
    process.env.AI_DAILY_CAP_PER_USER = "1";
    await prisma.aiUsage.create({ data: { userId: "u1", createdAt: new Date(Date.now() - 25 * 3600_000) } });
    create.mockResolvedValue(ok(SUGGESTIONS));
    expect((await getCoachingProvider().suggestImprovements(ctx("u1"))).data).not.toBeNull();
  });
});

describe("concurrency, pruning and cleanup", () => {
  it("never lets simultaneous calls exceed the per-user cap", async () => {
    on();
    process.env.AI_DAILY_CAP_PER_USER = "3";
    create.mockResolvedValue(ok(SUGGESTIONS));
    const p = getCoachingProvider();
    const results = await Promise.all(Array.from({ length: 8 }, () => p.suggestImprovements(ctx("u1"))));
    const served = results.filter((r) => r.data !== null).length;
    expect(served).toBeLessThanOrEqual(3);
    expect(create.mock.calls.length).toBe(served);
    expect(await prisma.aiUsage.count({ where: { userId: "u1" } })).toBeLessThanOrEqual(3);
  });
  it("prunes rows older than two days", async () => {
    on();
    await prisma.aiUsage.create({ data: { userId: "old", createdAt: new Date(Date.now() - 3 * 24 * 3600_000) } });
    create.mockResolvedValue(ok(SUGGESTIONS));
    await getCoachingProvider().suggestImprovements(ctx("u1"));
    await new Promise((r) => setTimeout(r, 100));
    expect(await prisma.aiUsage.count({ where: { userId: "old" } })).toBe(0);
  });
});

describe("failure handling", () => {
  it("returns fallback text when the call fails, without throwing or leaking", async () => {
    on();
    create.mockRejectedValue(new Error("boom sk-test-not-real 500"));
    const r = await getCoachingProvider().suggestImprovements(ctx("u1"));
    expect(r.data).toBeNull();
    expect(r.message).toMatch(/isn't available/);
    expect(JSON.stringify(r)).not.toContain("boom");
  });
  it("returns fallback text on empty or malformed output", async () => {
    on();
    create.mockResolvedValue({ content: [] });
    expect((await getCoachingProvider().clusterMistakes(ctx("u1"))).message).toMatch(/isn't available/);
    create.mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    expect((await getCoachingProvider().summarizeDay(ctx("u1"), "2026-10-08")).data).toBeNull();
  });
});
