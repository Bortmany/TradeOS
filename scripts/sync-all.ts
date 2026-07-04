// Self-hosted auto-sync fallback (run: npx tsx scripts/sync-all.ts).
// Syncs every broker connection directly against the database — useful for
// system cron on a VPS, or local testing. On Vercel, prefer the built-in cron
// hitting /api/cron/sync (see vercel.json).
//
// Example crontab entry (every 30 minutes):
//   */30 * * * * cd /path/to/tradeos && npx tsx scripts/sync-all.ts >> sync.log 2>&1

import { PrismaClient } from "@prisma/client";

(async () => {
  const prisma = new PrismaClient();
  try {
    const { syncConnection } = await import("../src/lib/connectors/sync");
    const connections = await prisma.brokerConnection.findMany({
      orderBy: { lastSyncAt: "asc" },
      select: { id: true, userId: true, externalAccountName: true },
    });
    if (connections.length === 0) {
      console.log("No broker connections to sync.");
      return;
    }
    let imported = 0;
    let failed = 0;
    for (const conn of connections) {
      const label = conn.externalAccountName ?? conn.id;
      try {
        const r = await syncConnection(conn.id, conn.userId);
        imported += r.imported;
        console.log(`✓ ${label}: +${r.imported} imported, ${r.skipped} deduped`);
      } catch (err) {
        failed++;
        console.error(`✗ ${label}: ${(err as Error).message}`);
      }
    }
    console.log(`Done. ${connections.length} connection(s), +${imported} trades, ${failed} failed.`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error("sync-all failed:", err);
  process.exit(1);
});
