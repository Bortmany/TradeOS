import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingestCsv } from "@/lib/ingestion";
import { getFeatures, effectivePlan, withinLimit } from "@/lib/billing/plans";
import { rateLimit, enforceUserRateLimit } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";
import type { Broker, Plan } from "@/lib/types";
import { NOT_A_CSV_ERROR } from "@/lib/validation";
import { BROKERS, ServerTimeSchema } from "@/lib/types";
import { mt5AccountCurrencyProblem } from "@/lib/ingestion/adapters/mt5";

import { MAX_CSV_CHARS, importRowLimit } from "@/lib/import-limits";
import { refuseDemo } from "@/lib/demo-guard";

// Either an existing account, or a name + starting balance to create one as part of
// the import (so a brand-new trader never has to detour through Accounts).
const newAccountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(80),
  startingBalance: z.coerce.number().finite().min(0).default(0),
});

const schema = z.object({
  accountId: z.string().min(1).optional(),
  newAccount: newAccountSchema.optional(),
  csvText: z.string().min(1).max(MAX_CSV_CHARS, "That file is too large to import in one go (2 MB limit). Split it and try again."),
  broker: z.enum(BROKERS).optional(),
  // Which clock an MT5 file's times use. Other formats ignore it.
  serverTime: ServerTimeSchema.optional(),
}).refine((v) => Boolean(v.accountId) !== Boolean(v.newAccount), {
  message: "Choose an account or name a new one.",
});

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  // Imports loop many DB writes — cap the rate. 20 per user / 10 min.
  const rl = rateLimit(`import:${user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many imports in a short time. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const { accountId, newAccount, csvText, broker, serverTime } = schema.parse(await req.json());

    // Look the existing account up first (user-scoped). A new account is only
    // created further down, once the file has proved to be a real broker CSV.
    let account = accountId
      ? await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: user.id } })
      : null;
    if (accountId && !account) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }

    const result = ingestCsv(csvText, broker as Broker | undefined, { serverTime });

    // Not a spreadsheet of trades at all: plain error, and NO import record,
    // NO account and NO trades are created.
    if (result.notTradeFile && !result.refusal) {
      return NextResponse.json({ ok: false, code: "not_csv", error: NOT_A_CSV_ERROR }, { status: 400 });
    }

    // A whole-file problem (wrong MT5 table, semicolons): say so plainly, save nothing.
    if (result.refusal) {
      return NextResponse.json({ ok: false, error: result.refusal }, { status: 400 });
    }
    // MT5 profit is taken as dollars, so only a USD account can receive it.
    if (result.broker === "mt5") {
      const problem = account ? mt5AccountCurrencyProblem(account.currency) : null;
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    }

    // Feature gate: cap the number of parsed rows BEFORE any insert. The plan's
    // own limit applies when it has one; otherwise a fixed ceiling.
    const planLimit = getFeatures(effectivePlan(user.plan as never, user.billingStatus)).maxTradesPerImport;
    const limit = importRowLimit(planLimit);
    if (result.trades.length > limit) {
      return NextResponse.json(
        {
          ok: false,
          error: `Your plan allows up to ${limit.toLocaleString()} trades per import. Upgrade to import more.`,
        },
        { status: 403 }
      );
    }

    // Create the inline account now: the file is good and inside the plan's row limit.
    if (!account && newAccount) {
      const writeLimited = enforceUserRateLimit("accounts:write", user.id);
      if (writeLimited) return writeLimited;
      const currentCount = await prisma.tradingAccount.count({ where: { userId: user.id } });
      if (!withinLimit(user.plan as Plan, user.billingStatus, "maxAccounts", currentCount)) {
        return NextResponse.json(
          { ok: false, error: "You've reached your plan's account limit. Upgrade to add more accounts." },
          { status: 403 }
        );
      }
      account = await prisma.tradingAccount.create({
        data: {
          userId: user.id,
          name: newAccount.name,
          broker: result.broker === "generic" ? "manual" : result.broker,
          kind: "live",
          startingBalance: newAccount.startingBalance,
        },
      });
    }
    if (!account) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
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
            assetClass: t.assetClass ?? null,
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
      accountId: account.id,
      broker: result.broker,
      imported,
      skipped,
      errors,
      // MT5 only: how the file's times were read, and how many open positions were left out.
      ...(result.timesReadAs ? { timesReadAs: result.timesReadAs } : {}),
      ...(result.openSkipped !== undefined ? { openSkipped: result.openSkipped } : {}),
    });
  } catch (err) {
    // Never echo a raw error message to the client — the shared helper maps it
    // to a safe, plain-English response (and handles bad-JSON bodies as a 400).
    return apiErrorResponse(err, { validationMessage: "Invalid request." });
  }
});
