import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/connectors/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function budget for larger batches

// Constant-time string comparison — avoids leaking how much of the secret
// matched through response timing. Returns false on any length mismatch.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Scheduled auto-sync for all broker connections. This endpoint iterates EVERY
// user's connections, so it must never be open. Invoked by the platform cron or
// any external scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync
//
// Auth: CRON_SECRET is REQUIRED in every environment. If it isn't configured we
// refuse (503) and never touch the database — there is no "open in dev" path.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
