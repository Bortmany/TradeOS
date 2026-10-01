// TradeOS — trade screenshots: the limits and the clean-up helper, in one place.
// Every attachment is reached through its trade, and a trade belongs to one user,
// so "owned by this user" always means `trade: { userId }`.

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export const MAX_SCREENSHOTS_PER_TRADE = 5;
export const MAX_SCREENSHOTS_PER_USER = 200;
export const MAX_USER_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB
/** Uploads per person per 10 minutes, on top of the general write limit. */
export const UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const;

export async function userScreenshotUsage(userId: string): Promise<{ count: number; bytes: number }> {
  const agg = await prisma.attachment.aggregate({
    where: { kind: "screenshot", trade: { userId } },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  return { count: agg._count._all, bytes: agg._sum.sizeBytes ?? 0 };
}

export const TRADE_FULL_MESSAGE = `This trade already has ${MAX_SCREENSHOTS_PER_TRADE} screenshots.`;
export const QUOTA_MESSAGE = "You've reached your upload limit for now, try again in a few minutes.";

class OverCap extends Error {
  constructor(readonly code: "trade_full" | "quota") {
    super(code);
  }
}

export type CreateScreenshotResult =
  | { ok: true; id: string }
  | { ok: false; code: "trade_full" | "quota"; status: 409 | 429; message: string };

/**
 * Save the picture's row, then re-count the caps INCLUDING it, in the same
 * transaction. The in-process one-at-a-time guard below only covers one server
 * process, so this is what actually holds the line when two run side by side: if
 * the new row pushed the trade past 5, or the person past 200 pictures / 500 MB,
 * the transaction rolls back (the row is gone) and the stored file is deleted too.
 */
export async function createScreenshotWithinCaps(
  userId: string,
  data: { tradeId: string; url: string; mimeType: string; sizeBytes: number }
): Promise<CreateScreenshotResult> {
  try {
    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.attachment.create({
        data: { ...data, kind: "screenshot" },
        select: { id: true },
      });
      const onTrade = await tx.attachment.count({ where: { tradeId: data.tradeId, kind: "screenshot" } });
      if (onTrade > MAX_SCREENSHOTS_PER_TRADE) throw new OverCap("trade_full");
      const agg = await tx.attachment.aggregate({
        where: { kind: "screenshot", trade: { userId } },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      });
      if (agg._count._all > MAX_SCREENSHOTS_PER_USER || (agg._sum.sizeBytes ?? 0) > MAX_USER_STORAGE_BYTES) {
        throw new OverCap("quota");
      }
      return row.id;
    });
    return { ok: true, id };
  } catch (err) {
    // Whatever went wrong, the row is not saved: don't leave an orphan file behind.
    await getStorage()?.delete(data.url).catch(() => undefined);
    if (err instanceof OverCap) {
      return err.code === "trade_full"
        ? { ok: false, code: "trade_full", status: 409, message: TRADE_FULL_MESSAGE }
        : { ok: false, code: "quota", status: 429, message: QUOTA_MESSAGE };
    }
    throw err;
  }
}

/**
 * Remove the stored files for every attachment matching `where`. Call it BEFORE
 * deleting the trade, account or user (the rows go with them), so no file is left
 * behind. Best effort: a storage hiccup never blocks the delete the user asked for.
 */
export async function purgeStoredFiles(where: Prisma.AttachmentWhereInput): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  const rows = await prisma.attachment.findMany({ where, select: { url: true } });
  for (const row of rows) {
    try {
      await storage.delete(row.url);
    } catch {
      /* best-effort */
    }
  }
}

// One upload at a time per person (the app runs as one process), so two quick
// uploads can't both slip under the 5-per-trade or storage caps.
const chains = new Map<string, Promise<unknown>>();
export function serializePerUser<T>(userId: string, job: () => Promise<T>): Promise<T> {
  const prev = chains.get(userId) ?? Promise.resolve();
  const next = prev.then(job, job);
  const tail = next.catch(() => undefined);
  chains.set(userId, tail);
  void tail.then(() => {
    if (chains.get(userId) === tail) chains.delete(userId);
  });
  return next;
}
