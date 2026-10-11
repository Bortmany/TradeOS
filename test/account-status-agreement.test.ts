// One name, one status, one broker label (spec test 8).
//
// Runs the REAL seed (prisma/seed.ts) against the throwaway test database, then
// reads the seeded Topstep account the three ways the app shows it — the
// Accounts page (account row), the Prop page (getPropStatus) and a trade header
// (getTradeDetail) — through the one shared helper, and checks they agree. It
// also proves the seed plants no alert that can never clear: every open alert
// must come from the real generator (meta.auto), which replaces its own alerts
// on every recompute.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db";
import { getPropStatus } from "@/lib/prop";
import { getTradeDetail } from "@/lib/journal";
import { recentViolationsOf } from "@/lib/data";
import {
  accountDisplay,
  brokerLabel,
  evalProgressLabel,
  accountStatusLabel,
} from "@/lib/account-display";
import { collapseViolations } from "@/lib/violation-rows";
import { DEMO_EMAIL, isDemoDesk } from "@/lib/demo-desk";
import type { TradeRecord } from "@/lib/types";
import type { EvalResult } from "@/lib/rules/engine";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const seedPath = fileURLToPath(new URL("../prisma/seed.ts", import.meta.url));

describe("the seeded demo desk agrees with itself", () => {
  let userId = "";

  beforeAll(() => {
    // Seed the THROWAWAY database only (DATABASE_URL is the vitest test DB).
    execFileSync(fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)), [seedPath], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        NODE_ENV: "test",
        SEED_DEMO_PASSWORD: "test-only-demo-password-long-enough",
      },
      stdio: "pipe",
    });
  }, 180_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  });

  it("Accounts, Prop and the trade header show the same name, status and broker", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    userId = user.id;
    const account = await prisma.tradingAccount.findFirstOrThrow({
      where: { userId, name: "Topstep 50K" },
    });

    // Accounts page: the account row itself.
    const onAccounts = accountDisplay(account);

    // Prop page: the tracker's view of the same account.
    const prop = (await getPropStatus(userId)).find((s) => s.accountId === account.id);
    expect(prop).toBeDefined();
    const onProp = accountDisplay({
      name: prop!.accountName,
      kind: prop!.accountKind,
      broker: prop!.accountBroker,
    });

    // Trade header: a trade in that account.
    const trade = await prisma.trade.findFirstOrThrow({ where: { userId, accountId: account.id } });
    const detail = await getTradeDetail(userId, trade.id);
    expect(detail?.account).toBeTruthy();
    const onTrade = accountDisplay(detail!.account!);

    expect(onProp).toEqual(onAccounts);
    expect(onTrade).toEqual(onAccounts);
    expect(onAccounts).toMatchObject({ name: "Topstep 50K", status: "Funded", broker: "TopstepX" });

    // The tracker's phase no longer contradicts the account, and it is only
    // ever shown with the "Eval progress" prefix — never as a bare status.
    expect(prop!.phase).toBe(account.kind);
    expect(evalProgressLabel(prop!.phase)).toBe("Eval progress: Funded");
  });

  it("has no hand-planted alert: every open alert comes from the generator", async () => {
    const alerts = await prisma.alert.findMany({ where: { userId, status: "open" } });
    for (const a of alerts) {
      expect(a.meta ?? "").toContain('"auto":true');
    }
    // And the seed source itself never writes an alert row directly.
    const source = readFileSync(seedPath, "utf8");
    expect(source).not.toMatch(/prisma\.alert\.(create|createMany|upsert)\b/);
  });

  it("the demo desk is recognised by the seed's own email", () => {
    const source = readFileSync(seedPath, "utf8");
    expect(source).toContain(`const email = "${DEMO_EMAIL}"`);
    expect(isDemoDesk(DEMO_EMAIL)).toBe(true);
    expect(isDemoDesk("  Demo@TradeOS.app ")).toBe(true);
    expect(isDemoDesk("trader@example.com")).toBe(false);
    expect(isDemoDesk(null)).toBe(false);
  });
});

describe("account display helper", () => {
  it("one spelling per broker key, and a safe fallback", () => {
    expect(brokerLabel("topstepx")).toBe("TopstepX");
    expect(brokerLabel("ibkr")).toBe("Interactive Brokers");
    expect(brokerLabel("some_new_broker")).toBe("Some New Broker");
    expect(brokerLabel(null)).toBe("Manual");
  });

  it("status comes from the account kind", () => {
    expect(accountStatusLabel("funded")).toBe("Funded");
    expect(accountStatusLabel("evaluation")).toBe("Evaluation");
    expect(evalProgressLabel("evaluation")).toBe("Eval progress: Evaluation");
    expect(evalProgressLabel("")).toBe("Eval progress: Not started");
  });
});

describe("recent violations", () => {
  const t = (id: string, side: "long" | "short", exit: boolean): TradeRecord => ({
    id,
    userId: "u",
    accountId: "a",
    symbol: "MES",
    side,
    entryPrice: 1,
    exitPrice: exit ? 1 : null,
    quantity: 1,
    entryTime: new Date("2026-09-15T13:45:00Z"),
    exitTime: exit ? new Date("2026-09-15T14:00:00Z") : null,
    fees: 0,
    pnl: exit ? -120 : 0,
    pnlGross: null,
    strategyTag: null,
    notes: null,
    emotions: null,
    tags: null,
    source: "manual",
    externalId: null,
    isWin: null,
    complianceScore: null,
    violationCount: 0,
  });
  const fail = (ruleId: string, ruleName: string): EvalResult => ({
    ruleId,
    ruleName,
    status: "fail",
    severity: "high",
    explanation: "Entered 09:45 ET — x",
  });

  it("carry the trade's side and open state, newest first, capped", () => {
    const trades = [t("t2", "short", false), t("t1", "long", true)];
    const out = recentViolationsOf(trades, { t1: [fail("r1", "Window")], t2: [fail("r1", "Window")] });
    expect(out.map((v) => [v.tradeId, v.side, v.isOpen])).toEqual([
      ["t2", "short", true],
      ["t1", "long", false],
    ]);
    expect(recentViolationsOf(trades, { t1: [fail("r1", "a"), fail("r2", "b")], t2: [fail("r3", "c")] }, 2)).toHaveLength(2);
  });

  it("identical repeats (same rule, same trade) collapse into one row with a count", () => {
    const trades = [t("t1", "long", true), t("t2", "long", true)];
    const v = recentViolationsOf(trades, {
      t1: [fail("r1", "Daily loss"), fail("r9", "Daily loss"), fail("r8", "Daily loss"), fail("r2", "Window")],
      t2: [fail("r1", "Daily loss")],
    }, 10);
    const rows = collapseViolations(v);
    expect(rows.map((r) => [r.tradeId, r.ruleName, r.count])).toEqual([
      ["t1", "Daily loss", 3],
      ["t1", "Window", 1],
      ["t2", "Daily loss", 1], // a different trade never merges
    ]);
  });
});
