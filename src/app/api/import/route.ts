import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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
    let deduped = 0;
    const insertErrors: string[] = [];
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
      } catch (e) {
        // Only a GENUINE dedupe — the unique index on [accountId, externalId]
        // rejecting a row we've already imported — is an expected, silent skip.
        // Anything else (bad data that slipped through, a real database error)
        // must be surfaced as an error, never quietly counted as a skip, or a
        // whole import can report "ok" while silently dropping rows.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          deduped++;
        } else {
          insertErrors.push(`${t.symbol}: could not be saved (unexpected data in this row).`);
        }
      }
    }

    // "skipped" in the response is the honest count of rows that were not saved
    // for a benign reason (parser skips + genuine dedupes). Rows that failed to
    // insert for any OTHER reason are reported in `errors`, not hidden here.
    const skipped = result.skipped + deduped;
    const errors = [...result.errors, ...insertErrors].slice(0, 10);

    // The batch row has no error column, so its skippedCount records every row
    // that didn't make it in (dedupes + failed inserts) to keep rowCount honest.
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { importedCount: imported, skippedCount: skipped + insertErrors.length },
    });

    // Recompute discipline/compliance in the background of the request.
    await recomputeCompliance(user.id);

    return NextResponse.json({
      ok: true,
      broker: result.broker,
      imported,
      skipped,
      errors,
    });
  } catch (err) {
    // Never echo a raw error message to the client — the shared helper maps it
    // to a safe, plain-English response (and handles bad-JSON bodies as a 400).
    return apiErrorResponse(err, { validationMessage: "Invalid request." });
  }
});
