import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/connectors/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function budget for larger batches

// Scheduled auto-sync for all broker connections. Invoked by Vercel Cron (see
// vercel.json) or any external scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync
//
// Auth: requires CRON_SECRET in production (Vercel Cron sends it automatically
// when the env var is set). Without the secret configured, the endpoint only
// works in development so local testing stays frictionless.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const connections = await prisma.brokerConnection.findMany({
    orderBy: { lastSyncAt: "asc" }, // stalest first, in case we hit the time budget
    select: { id: true, userId: true, externalAccountName: true },
  });

  const results: {
    connectionId: string;
    account: string | null;
    imported?: number;
    skipped?: number;
    error?: string;
  }[] = [];

  // Sequential on purpose: keeps gateway load polite and error isolation simple.
  for (const conn of connections) {
    try {
      const r = await syncConnection(conn.id, conn.userId);
      results.push({
        connectionId: conn.id,
        account: conn.externalAccountName,
        imported: r.imported,
        skipped: r.skipped,
      });
    } catch (err) {
      // syncConnection already recorded status=error + lastError on the row.
      results.push({
        connectionId: conn.id,
        account: conn.externalAccountName,
        error: err instanceof Error ? err.message : "Sync failed.",
      });
    }
  }

  const imported = results.reduce((s, r) => s + (r.imported ?? 0), 0);
  const failed = results.filter((r) => r.error).length;
  return NextResponse.json({
    ok: true,
    connections: results.length,
    imported,
    failed,
    results,
    time: new Date().toISOString(),
  });
}
