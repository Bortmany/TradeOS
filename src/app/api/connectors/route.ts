import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { pxLogin, pxSearchAccounts, ConnectorError } from "@/lib/connectors/topstepx";
import { FIRM_IDS, getFirm } from "@/lib/connectors/firms";
import { syncConnection } from "@/lib/connectors/sync";
import { withinLimit } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import {
  enforceUserRateLimit,
  USER_EXTERNAL_LIMIT,
  USER_WRITE_LIMIT,
} from "@/lib/rate-limit";
import { healthOf } from "@/lib/live/state";
import { sessionKey, dropSessionToken } from "@/lib/connectors/session";
import { refuseDemo } from "@/lib/demo-guard";

// The gateway address is never taken from the request: the client sends a firm
// id from the registry and the server looks up the URL itself. A stray
// `baseUrl` in the body is ignored (zod strips unknown keys).
const firmField = z.enum(FIRM_IDS).default("topstepx");

const discoverSchema = z.object({
  action: z.literal("discover"),
  firm: firmField,
  username: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(500),
});

const connectSchema = z.object({
  action: z.literal("connect"),
  firm: firmField,
  username: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(500),
  externalAccountId: z.string().min(1).max(100),
  externalAccountName: z.string().max(200).optional(),
});

const nearLiveSchema = z.object({
  id: z.string().min(1).max(100),
  nearLive: z.boolean(),
});

export const GET = withUser(async (user) => {
  const now = new Date();
  const rows = await prisma.brokerConnection.findMany({
    where: { userId: user.id },
    include: { account: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    ok: true,
    connections: rows.map((c) => ({
      id: c.id,
      broker: c.broker,
      username: c.username,
      baseUrl: c.baseUrl,
      externalAccountId: c.externalAccountId,
      externalAccountName: c.externalAccountName,
      accountId: c.accountId,
      accountName: c.account.name,
      status: c.status,
      lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      lastError: c.lastError,
      // Near-live (read-only positions and balance). Never the key, never a token.
      nearLive: c.nearLive,
      lastBalance: c.lastBalance,
      lastLiveAt: c.lastLiveAt ? c.lastLiveAt.toISOString() : null,
      lastLiveError: c.lastLiveError,
      liveHealth: healthOf(c, now),
    })),
  });
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  // Tight limit: both actions reach out to the broker's API (login / account
  // search / initial sync), so each request is slow and network-bound.
  const limited = enforceUserRateLimit("connectors:write", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const action = (body as { action?: string }).action;

  try {
    if (action === "discover") {
      const d = discoverSchema.parse(body);
      const firm = getFirm(d.firm);
      if (!firm) {
        return NextResponse.json({ ok: false, error: "Unknown broker." }, { status: 400 });
      }
      const token = await pxLogin(firm.apiBase, d.username, d.apiKey);
      const accounts = await pxSearchAccounts(firm.apiBase, token);
      return NextResponse.json({ ok: true, accounts });
    }

    if (action === "connect") {
      const d = connectSchema.parse(body);
      const firm = getFirm(d.firm);
      if (!firm) {
        return NextResponse.json({ ok: false, error: "Unknown broker." }, { status: 400 });
      }
      const baseUrl = firm.apiBase;

      // Plan gate: connected accounts count toward the account limit.
      const accountCount = await prisma.tradingAccount.count({ where: { userId: user.id } });
      if (!withinLimit(user.plan as Plan, user.billingStatus, "maxAccounts", accountCount)) {
        return NextResponse.json(
          { ok: false, error: "Your plan's account limit is reached. Upgrade to link more accounts." },
          { status: 403 }
        );
      }

      const existing = await prisma.brokerConnection.findFirst({
        where: { userId: user.id, broker: firm.id, externalAccountId: d.externalAccountId },
      });
      // Reconnect: a connection whose key was rejected (or failed to sync with an
      // auth error) can be revived with a fresh key; nothing else about it changes.
      if (existing && (existing.liveStatus === "rejected" || existing.status === "error")) {
        await pxLogin(baseUrl, d.username, d.apiKey); // validate before saving
        dropSessionToken(sessionKey(existing.baseUrl, existing.username, d.apiKey));
        await prisma.brokerConnection.update({
          where: { id: existing.id },
          data: {
            username: d.username,
            apiKeyEnc: encryptSecret(d.apiKey),
            baseUrl,
            status: "connected",
            lastError: null,
            liveStatus: "ok",
            lastLiveError: null,
            nearLive: true,
          },
        });
        const result = await syncConnection(existing.id, user.id);
        return NextResponse.json({
          ok: true,
          connectionId: existing.id,
          accountId: existing.accountId,
          imported: result.imported,
        });
      }
      if (existing) {
        return NextResponse.json(
          { ok: false, error: "That broker account is already connected." },
          { status: 409 }
        );
      }

      // Validate credentials before persisting anything.
      await pxLogin(baseUrl, d.username, d.apiKey);

      const account = await prisma.tradingAccount.create({
        data: {
          userId: user.id,
          name: d.externalAccountName ?? `${firm.name} ${d.externalAccountId}`,
          broker: firm.id,
          kind: "funded",
          startingBalance: 0,
          color: "#22c55e",
        },
      });
      const conn = await prisma.brokerConnection.create({
        data: {
          userId: user.id,
          accountId: account.id,
          broker: firm.id,
          baseUrl,
          username: d.username,
          apiKeyEnc: encryptSecret(d.apiKey),
          externalAccountId: d.externalAccountId,
          externalAccountName: d.externalAccountName ?? null,
        },
      });

      const result = await syncConnection(conn.id, user.id);
      return NextResponse.json({
        ok: true,
        connectionId: conn.id,
        accountId: account.id,
        imported: result.imported,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Please check the connection fields." }, { status: 400 });
    }
    const message = err instanceof ConnectorError ? err.message : "Connection failed.";
    const status = err instanceof ConnectorError && (err.kind === "auth" || err.kind === "key_rejected") ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});

export const DELETE = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("connectors:delete", user.id);
  if (limited) return limited;

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
    const conn = await prisma.brokerConnection.findFirst({ where: { id, userId: user.id } });
    if (!conn) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    // Remove only the connection — the TradingAccount and its trades remain.
    await prisma.brokerConnection.delete({ where: { id: conn.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
});

// Near-live switch for one connection. Behind USER_WRITE_LIMIT; the lookup is
// filtered by the signed-in user. Turning it off stops the 60-second reads at
// the next tick (the 30-minute fill sync is unaffected). A connection whose key
// was rejected cannot be switched on until the trader reconnects.
export const PATCH = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("connectors:nearlive", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;

  try {
    const d = nearLiveSchema.parse(await req.json());
    const conn = await prisma.brokerConnection.findFirst({
      where: { id: d.id, userId: user.id },
      select: { id: true, liveStatus: true },
    });
    if (!conn) {
      return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    }
    if (d.nearLive && conn.liveStatus === "rejected") {
      return NextResponse.json(
        { ok: false, error: "Reconnect first. Live updates stay off until TradeOS has a working key." },
        { status: 409 }
      );
    }
    await prisma.brokerConnection.updateMany({
      where: { id: conn.id, userId: user.id },
      data: { nearLive: d.nearLive },
    });
    return NextResponse.json({ ok: true, nearLive: d.nearLive });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
});
