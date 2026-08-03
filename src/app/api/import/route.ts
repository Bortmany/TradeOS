import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingestCsv } from "@/lib/ingestion";
import { getFeatures, effectivePlan } from "@/lib/billing/plans";
import { rateLimit } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";
import type { Broker } from "@/lib/types";
import { BROKERS } from "@/lib/types";

const schema = z.object({
  accountId: z.string().min(1),
  csvText: z.string().min(1),
  broker: z.enum(BROKERS).optional(),
});

export const POST = withUser(async (user, req: Request) => {
  // Imports loop many DB writes — cap the rate. 20 per user / 10 min.
  const rl = rateLimit(`import:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many imports in a short time. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const { accountId, csvText, broker } = schema.parse(await req.json());

    const account = await prisma.tradingAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });
    if (!account) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }

    const result = ingestCsv(csvText, broker as Broker | undefined);

    // Feature gate: cap the import size by plan.
    const limit = getFeatures(effectivePlan(user.plan as never, user.billingStatus)).maxTradesPerImport;
    if (result.trades.length > limit) {
      return NextResponse.json(
        {
          ok: false,
          error: `Your plan allows up to ${limit.toLocaleString()} trades per import. Upgrade to import more.`,
        },
        { status: 403 }
      );
    }

    const batch = await prisma.importBatch.create({
      data: {
        userId: user.id,
        source: "csv",
        broker: result.broker,
        rowCount: result.trades.length + result.skipped,
        skippedCount: result.skipped,
        status: "completed",
      },
    });

    let imported = 0;
    for (const t of result.trades) {
      try {
        await prisma.trade.create({
          data: {
            userId: user.id,
            accountId: account.id,
            symbol: t.symbol,
            side: t.side,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice ?? null,
            quantity: t.quantity,
            entryTime: t.entryTime,
            exitTime: t.exitTime ?? null,
            fees: t.fees ?? 0,
            pnl: t.pnl ?? 0,
            pnlGross: t.pnlGross ?? null,
            strategyTag: t.strategyTag ?? null,
            notes: t.notes ?? null,
            emotions: t.emotions ?? null,
            tags: t.tags ?? null,
            source: "csv",
            externalId: t.externalId ?? null,
            importBatchId: batch.id,
            isWin: t.exitTime ? (t.pnl ?? 0) > 0 : null,
          },
        });
        imported++;
      } catch {
        // Likely a unique-constraint dedupe on [accountId, externalId]; skip.
      }
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { importedCount: imported, skippedCount: result.skipped + (result.trades.length - imported) },
    });

    // Recompute discipline/compliance in the background of the request.
    await recomputeCompliance(user.id);

    return NextResponse.json({
      ok: true,
      broker: result.broker,
      imported,
      skipped: result.skipped + (result.trades.length - imported),
      errors: result.errors.slice(0, 10),
    });
  } catch (err) {
    // Never echo a raw error message to the client — the shared helper maps it
    // to a safe, plain-English response (and handles bad-JSON bodies as a 400).
    return apiErrorResponse(err, { validationMessage: "Invalid request." });
  }
});
