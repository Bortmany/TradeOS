import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SIDES } from "@/lib/types";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import { enforceUserRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(SIDES),
  entryPrice: z.coerce.number(),
  exitPrice: z.coerce.number().optional().nullable(),
  quantity: z.coerce.number().positive(),
  entryTime: z.coerce.date(),
  exitTime: z.coerce.date().optional().nullable(),
  fees: z.coerce.number().default(0),
  strategyTag: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  emotions: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
        isWin,
      },
    });

    try {
      const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
      await recomputeUserCompliance(user.id);
    } catch {
      /* best-effort */
    }

    return NextResponse.json({ ok: true, id: trade.id });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? "Please check the trade fields." : err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
