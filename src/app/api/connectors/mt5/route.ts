// POST /api/connectors/mt5 — link an MT5 account READ-ONLY through MetaApi.
//
// Switched off until the owner signs up (METAAPI_ENABLED=true + METAAPI_TOKEN):
// while off this route refuses everything (503). Once on: paid plans only
// (Pro/Elite, active), at most 2 MT5 accounts per trader, investor (read-only)
// password only. The password is passed straight to MetaApi and is never stored,
// logged or returned. The account is created at MetaApi, checked to be read-only
// and in US dollars, and deleted again at once if it is not.
// Nothing here can place, change or cancel an order.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { refuseDemo } from "@/lib/demo-guard";
import {
  enforceUserRateLimit,
  rateLimit,
  USER_EXTERNAL_LIMIT,
} from "@/lib/rate-limit";
import { MT5_FIRM, MT5_FIRM_ID, metaApiSwitchedOn } from "@/lib/connectors/firms";
import {
  MT5_LIVE_MESSAGES,
  MetaApiError,
  maConnectInvestor,
  maDeleteAccountWithRetry,
} from "@/lib/connectors/metaapi";
import {
  MT5_MAX_ACCOUNTS,
  countMt5Connections,
  mt5PlanAllowed,
} from "@/lib/connectors/mt5-access";
import { SyncDeferred, syncConnection } from "@/lib/connectors/sync";
import { mt5AccountCurrencyProblem } from "@/lib/ingestion/adapters/mt5";
import { liveBudget } from "@/lib/live/budget";
import type { CallGate } from "@/lib/connectors/metaapi";

const schema = z.object({
  server: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[\w .\-()[\]]+$/),
  login: z.string().trim().regex(/^\d{1,12}$/),
  password: z.string().min(1).max(200),
  // Attach the live link to one of the trader's OWN trading accounts (so trades from an MT5
  // report file and from the live link land in one place and never double up). Left out =
  // a new "MT5 <login>" account.
  accountId: z.string().trim().min(1).max(64).optional(),
});

// One connect at a time per trader (stops two quick clicks from slipping past the 2-account limit).
const connecting = new Set<string>();

const budgetGate: CallGate = async () => {
  if (!liveBudget.take()) {
    throw new MetaApiError(MT5_LIVE_MESSAGES.busy, "busy", "rate_limit");
  }
};

function fail(error: string, status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;

  // The owner's switch comes first: while off, nothing below runs.
  if (!metaApiSwitchedOn()) return fail(MT5_LIVE_MESSAGES.off, 503, "mt5_off");

  const limited = enforceUserRateLimit("connectors:mt5", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;

  // Plan gate (fail closed).
  if (!mt5PlanAllowed({ plan: user.plan, billingStatus: user.billingStatus })) {
    return fail(MT5_LIVE_MESSAGES.plan, 403, "plan");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.", 400, "invalid");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Please check the MT5 fields.", 400, "invalid");
  const d = parsed.data;
  const label = `${d.server} · ${d.login}`;

  // Limit of 2 MT5 accounts per trader (fail closed: if we cannot count, we refuse).
  let count: number;
  try {
    count = await countMt5Connections(user.id);
  } catch {
    return fail("Connection failed.", 500, "error");
  }
  if (count >= MT5_MAX_ACCOUNTS) return fail(MT5_LIVE_MESSAGES.limit, 403, "limit");

  const duplicate = await prisma.brokerConnection.findFirst({
    where: { userId: user.id, broker: MT5_FIRM_ID, username: d.login, externalAccountName: label },
    select: { id: true },
  });
  if (duplicate) return fail("That MT5 account is already connected.", 409, "duplicate");

  // An existing journal account to attach to: the trader's own, US dollars, not linked yet.
  // Checked before anything is created at MetaApi.
  let attachTo: { id: string } | null = null;
  if (d.accountId) {
    const target = await prisma.tradingAccount.findFirst({
      where: { id: d.accountId, userId: user.id },
      select: { id: true, currency: true, brokerConnection: { select: { id: true } } },
    });
    if (!target) return fail("We couldn't find that trading account.", 404, "account_not_found");
    if (target.brokerConnection) {
      return fail("That trading account is already linked to a broker. Pick another or make a new one.", 409, "account_linked");
    }
    if (mt5AccountCurrencyProblem(target.currency)) return fail(MT5_LIVE_MESSAGES.notUsd, 422, "not_usd");
    attachTo = { id: target.id };
  }

  // Each attempt can cost the owner at MetaApi (it charges for repeated sign-in failures).
  const attempts = rateLimit(`mt5-connect:${user.id}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!attempts.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many tries. Please wait a few minutes and try again.", code: "slow_down" },
      { status: 429, headers: { "Retry-After": String(attempts.retryAfter) } }
    );
  }

  if (connecting.has(user.id)) return fail("Already connecting. Please wait.", 429, "busy");
  connecting.add(user.id);
  try {
    let connected;
    try {
      connected = await maConnectInvestor(
        { login: d.login, server: d.server, password: d.password },
        { gate: budgetGate }
      );
    } catch (err) {
      if (err instanceof MetaApiError) {
        // The reason is a code; the words are ours.
        switch (err.code) {
          case "trading_rights":
            return fail(MT5_LIVE_MESSAGES.tradingRights, 422, "trading_rights", { clearPassword: true });
          case "not_usd":
            return fail(MT5_LIVE_MESSAGES.notUsd, 422, "not_usd");
          case "bad_login":
            return fail(MT5_LIVE_MESSAGES.badLogin, 401, "bad_login");
          case "server_not_found":
            return fail(MT5_LIVE_MESSAGES.serverNotFound, 400, "server_not_found");
          case "off":
            return fail(MT5_LIVE_MESSAGES.off, 503, "mt5_off");
          case "busy":
            return fail(MT5_LIVE_MESSAGES.busy, 503, "busy");
          default:
            return fail(MT5_LIVE_MESSAGES.bridgeDown, 502, "bridge_down");
        }
      }
      return fail(MT5_LIVE_MESSAGES.bridgeDown, 502, "bridge_down");
    }

    // The bridge account is good: save our side. Anything that goes wrong now removes it again.
    let connId: string | null = null;
    let tradingAccountId: string | null = null;
    let createdAccount = false;
    try {
      if (attachTo) {
        tradingAccountId = attachTo.id;
      } else {
        const account = await prisma.tradingAccount.create({
          data: {
            userId: user.id,
            name: `MT5 ${d.login}`,
            broker: MT5_FIRM_ID,
            kind: "live",
            startingBalance: 0,
            color: "#22c55e",
          },
        });
        tradingAccountId = account.id;
        createdAccount = true;
      }
      const conn = await prisma.brokerConnection.create({
        data: {
          userId: user.id,
          accountId: tradingAccountId,
          broker: MT5_FIRM_ID,
          baseUrl: MT5_FIRM.apiBase,
          username: d.login,
          // There is no password to keep. The column is required, so it holds an encrypted
          // marker, never a credential.
          apiKeyEnc: encryptSecret("mt5-investor-password-not-stored"),
          externalAccountId: connected.accountId,
          externalAccountName: label,
          lastBalance: connected.info.balance,
        },
      });
      connId = conn.id;

      // Race guard: two connects that both passed the count above cannot both stay.
      if ((await countMt5Connections(user.id)) > MT5_MAX_ACCOUNTS) {
        throw new Error("limit");
      }
    } catch (err) {
      if (connId) await prisma.brokerConnection.deleteMany({ where: { id: connId, userId: user.id } });
      if (tradingAccountId && createdAccount) {
        await prisma.tradingAccount.deleteMany({ where: { id: tradingAccountId, userId: user.id } });
      }
      await maDeleteAccountWithRetry(connected.accountId);
      if (err instanceof Error && err.message === "limit") {
        return fail(MT5_LIVE_MESSAGES.limit, 403, "limit");
      }
      return fail("Connection failed.", 500, "error");
    }

    let imported = 0;
    let notes: string[] = [];
    try {
      const r = await syncConnection(connId, user.id, {
        beforeCall: async () => {
          if (!liveBudget.take()) throw new SyncDeferred();
        },
        onRateLimit: (s) => liveBudget.onRateLimited(s),
      });
      imported = r.imported;
      notes = r.notes ?? [];
    } catch {
      // The first history read can wait for the sweep; the link itself is good.
    }
    return NextResponse.json({
      ok: true,
      connectionId: connId,
      accountId: tradingAccountId,
      imported,
      notes,
    });
  } finally {
    connecting.delete(user.id);
  }
});
