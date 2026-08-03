import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SIDES } from "@/lib/types";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";

const schema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(40),
  side: z.enum(SIDES),
  // `.finite()` rejects Infinity/NaN before they ever reach the database.
  entryPrice: z.coerce.number().finite(),
  exitPrice: z.coerce.number().finite().optional().nullable(),
  quantity: z.coerce.number().finite().positive(),
  entryTime: z.coerce.date(),
  exitTime: z.coerce.date().optional().nullable(),
  fees: z.coerce.number().finite().default(0),
  strategyTag: z.string().max(120).optional().nullable(),
  // Match the length caps the PATCH route already enforces.
  notes: z.string().max(5000).optional().nullable(),
  emotions: z.string().max(500).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  // Optional caller-supplied dedupe token. Retrying the same create with the
  // same key returns the original trade instead of inserting a duplicate — so
  // 5 parallel identical submits produce ONE row, not five.
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export const POST = withUser(async (user, req: Request) => {
  const limited = enforceUserRateLimit("trades:create", user.id);
  if (limited) return limited;

  try {
    const d = schema.parse(await req.json());
    const account = await prisma.tradingAccount.findFirst({
      where: { id: d.accountId, userId: user.id },
    });
    if (!account) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });

    // Compute pnl if the trade is closed.
    let pnl = 0;
    let isWin: boolean | null = null;
    if (d.exitPrice != null && d.exitTime != null) {
      const mult = pointMultiplier(d.symbol);
      const gross =
        d.side === "long"
          ? (d.exitPrice - d.entryPrice) * d.quantity * mult
          : (d.entryPrice - d.exitPrice) * d.quantity * mult;
      pnl = gross - d.fees;
      isWin = pnl > 0;
    }

    // When an idempotency key is supplied we store it as the trade's externalId
    // (namespaced so it can't collide with a real broker order id). The schema's
    // @@unique([accountId, externalId]) then guarantees at most one row per key.
    const externalId = d.idempotencyKey ? `idmp:${d.idempotencyKey}` : null;

    let tradeId: string;
    try {
      const trade = await prisma.trade.create({
        data: {
          userId: user.id,
          accountId: account.id,
          symbol: d.symbol.toUpperCase(),
          side: d.side,
          entryPrice: d.entryPrice,
          exitPrice: d.exitPrice ?? null,
          quantity: d.quantity,
          entryTime: d.entryTime,
          exitTime: d.exitTime ?? null,
          fees: d.fees,
          pnl,
          strategyTag: d.strategyTag || null,
          notes: d.notes || null,
          emotions: d.emotions || null,
          tags: d.tags || null,
          source: "manual",
          externalId,
          isWin,
        },
      });
      tradeId = trade.id;
    } catch (err) {
      // A concurrent create with the same idempotency key hit the unique index —
      // return the trade that won the race so the retry is a no-op success.
      if (
        externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await prisma.trade.findFirst({
          where: { accountId: account.id, externalId },
          select: { id: true },
        });
        if (existing) return NextResponse.json({ ok: true, id: existing.id });
      }
      throw err;
    }

    await recomputeCompliance(user.id);

    return NextResponse.json({ ok: true, id: tradeId });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please check the trade fields." });
  }
});
