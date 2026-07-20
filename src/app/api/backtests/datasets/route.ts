// TradeOS — market dataset upload (candle CSV) and delete. Same transport as
// /api/import: the client reads the file with file.text() and POSTs JSON.
// Hard caps keep rows bounded: 2 MB of CSV text, 25,000 candles per dataset.
// Deleting a dataset leaves its runs intact (BacktestRun.datasetId → SetNull).

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { hasFeature } from "@/lib/billing/plans";
import { parseCandleCsv } from "@/lib/backtest";
import type { Plan } from "@/lib/types";

const MAX_CANDLES = 25000;
const MAX_DATASETS_PER_USER = 20; // total storage cap — rate limits bound only the rate

const postSchema = z.object({
  name: z.string().min(1).max(120),
  symbol: z.string().min(1).max(20),
  timeframe: z.string().max(10).optional(),
  csvText: z.string().min(1).max(2_000_000),
});

export const POST = withUser(async (user, req: Request) => {
  // Uploads carry megabyte payloads — keep them occasional. 10 / 10 min.
  const rl = rateLimit(`backtests-datasets:${user.id}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads in a short time. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  if (!hasFeature(user.plan as Plan, user.billingStatus, "backtesting")) {
    return NextResponse.json(
      { ok: false, error: "Backtesting is a Pro feature. Upgrade to upload market data." },
      { status: 403 }
    );
  }

  try {
    const d = postSchema.parse(await req.json());

    const datasetCount = await prisma.marketDataset.count({ where: { userId: user.id } });
    if (datasetCount >= MAX_DATASETS_PER_USER) {
      return NextResponse.json(
        {
          ok: false,
          error: `You've reached the limit of ${MAX_DATASETS_PER_USER} datasets. Delete old datasets to make room.`,
        },
        { status: 400 }
      );
    }

    const { candles, skipped, errors } = parseCandleCsv(d.csvText);
    if (candles.length === 0) {
      return NextResponse.json(
        { ok: false, error: errors[0] ?? "No readable candles in that file." },
        { status: 400 }
      );
    }
    if (candles.length > MAX_CANDLES) {
      return NextResponse.json(
        {
          ok: false,
          error: `Datasets are capped at ${MAX_CANDLES.toLocaleString()} candles — this file has ${candles.length.toLocaleString()}. Trim the date range and try again.`,
        },
        { status: 400 }
      );
    }

    const dataset = await prisma.marketDataset.create({
      data: {
        userId: user.id,
        name: d.name,
        symbol: d.symbol.trim().toUpperCase(),
        timeframe: d.timeframe?.trim() || "5m",
        candleCount: candles.length,
        firstTime: new Date(candles[0].t * 1000),
        lastTime: new Date(candles[candles.length - 1].t * 1000),
        candles: JSON.stringify(candles),
        source: "csv",
      },
    });

    return NextResponse.json({
      ok: true,
      id: dataset.id,
      candles: candles.length,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? "Please check the dataset fields."
        : err instanceof Error
          ? err.message
          : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});

const deleteSchema = z.object({ id: z.string().min(1) });

export const DELETE = withUser(async (user, req: Request) => {
  const limited = rateLimit(`backtests-datasets:${user.id}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const { id } = deleteSchema.parse(await req.json());
    const owned = await prisma.marketDataset.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Dataset not found." }, { status: 404 });
    }

    // Runs keep their snapshotted results; datasetId nulls out via the schema.
    await prisma.marketDataset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
