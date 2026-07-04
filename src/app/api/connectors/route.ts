import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import {
  pxLogin,
  pxSearchAccounts,
  ConnectorError,
  DEFAULT_BASE_URL,
} from "@/lib/connectors/topstepx";
import { syncConnection } from "@/lib/connectors/sync";
import { withinLimit } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";

const discoverSchema = z.object({
  action: z.literal("discover"),
  username: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

const connectSchema = z.object({
  action: z.literal("connect"),
  username: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  externalAccountId: z.string().min(1),
  externalAccountName: z.string().optional(),
});

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
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
    })),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
      const baseUrl = d.baseUrl ?? DEFAULT_BASE_URL;
      const token = await pxLogin(baseUrl, d.username, d.apiKey);
      const accounts = await pxSearchAccounts(baseUrl, token);
      return NextResponse.json({ ok: true, accounts });
    }

    if (action === "connect") {
      const d = connectSchema.parse(body);
      const baseUrl = d.baseUrl ?? DEFAULT_BASE_URL;

      // Plan gate: connected accounts count toward the account limit.
      const accountCount = await prisma.tradingAccount.count({ where: { userId: user.id } });
      if (!withinLimit(user.plan as Plan, user.billingStatus, "maxAccounts", accountCount)) {
        return NextResponse.json(
          { ok: false, error: "Your plan's account limit is reached. Upgrade to link more accounts." },
          { status: 403 }
        );
      }

      const existing = await prisma.brokerConnection.findFirst({
        where: { userId: user.id, broker: "topstepx", externalAccountId: d.externalAccountId },
      });
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
          name: d.externalAccountName ?? `TopstepX ${d.externalAccountId}`,
          broker: "topstepx",
          kind: "funded",
          startingBalance: 0,
          color: "#22c55e",
        },
      });
      const conn = await prisma.brokerConnection.create({
        data: {
          userId: user.id,
          accountId: account.id,
          broker: "topstepx",
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
    const status = err instanceof ConnectorError && err.kind === "auth" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
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
}
