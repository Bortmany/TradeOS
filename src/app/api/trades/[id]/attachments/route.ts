// TradeOS — upload one screenshot to a trade the signed-in user owns.
//
// multipart/form-data, one field named "file". The picture's type is decided from
// its own bytes (PNG / JPEG / WebP only; the name and the claimed type are ignored),
// it must be 5 MB or less, a trade holds at most 5, a person at most 200 pictures
// and 500 MB. JPEGs are stored with their hidden location data removed. The storage
// key is generated here ("<userId>/<random>.<ext>"); nothing the user typed is used.
// Afterwards the user's rule compliance is recomputed so a "screenshot required"
// rule passes. The scoring engine itself is untouched.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";
import { getStorage, newStorageKey } from "@/lib/storage";
import { MAX_IMAGE_BYTES, sniffImage, stripJpegMetadata } from "@/lib/storage/image";
import { refuseDemo } from "@/lib/demo-guard";
import {
  MAX_SCREENSHOTS_PER_TRADE,
  MAX_SCREENSHOTS_PER_USER,
  MAX_USER_STORAGE_BYTES,
  UPLOAD_RATE_LIMIT,
  serializePerUser,
  userScreenshotUsage,
} from "@/lib/attachments";

export const runtime = "nodejs";

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export const POST = withUser(async (
  user,
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("attachments:write", user.id);
  if (limited) return limited;
  const uploadLimited = enforceUserRateLimit("attachments:upload", user.id, UPLOAD_RATE_LIMIT);
  if (uploadLimited) return uploadLimited;

  const storage = getStorage();
  if (!storage) return fail(503, "storage_off", "Screenshots aren't switched on yet.");

  try {
    const { id } = await params;
    const trade = await prisma.trade.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!trade) return fail(404, "not_found", "Trade not found.");

    // Refuse an obviously huge body before reading it (the real size is checked below).
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 512 * 1024) {
      return fail(413, "too_big", "That picture is over 5 MB.");
    }

    let file: FormDataEntryValue | null;
    try {
      file = (await req.formData()).get("file");
    } catch {
      return fail(400, "bad_request", "Please choose a picture to upload.");
    }
    if (!file || typeof file === "string") {
      return fail(400, "bad_request", "Please choose a picture to upload.");
    }
    if (file.size > MAX_IMAGE_BYTES) return fail(413, "too_big", "That picture is over 5 MB.");

    const raw = Buffer.from(await file.arrayBuffer());
    if (raw.length === 0 || raw.length > MAX_IMAGE_BYTES) {
      return fail(raw.length === 0 ? 415 : 413, raw.length === 0 ? "bad_type" : "too_big",
        raw.length === 0 ? "That file isn't a PNG, JPEG or WebP picture." : "That picture is over 5 MB.");
    }
    const kind = sniffImage(raw);
    if (!kind) return fail(415, "bad_type", "That file isn't a PNG, JPEG or WebP picture.");

    // Location data off JPEGs. A JPEG we can't read cleanly is refused, never stored as is.
    let bytes: Buffer = raw;
    if (kind.mime === "image/jpeg") {
      const cleaned = stripJpegMetadata(raw);
      if (!cleaned) return fail(415, "bad_type", "That file isn't a PNG, JPEG or WebP picture.");
      bytes = cleaned;
    }

    return await serializePerUser(user.id, async () => {
      const onTrade = await prisma.attachment.count({
        where: { tradeId: trade.id, kind: "screenshot" },
      });
      if (onTrade >= MAX_SCREENSHOTS_PER_TRADE) {
        return fail(409, "trade_full", `This trade already has ${MAX_SCREENSHOTS_PER_TRADE} screenshots.`);
      }
      const usage = await userScreenshotUsage(user.id);
      if (usage.count >= MAX_SCREENSHOTS_PER_USER || usage.bytes + bytes.length > MAX_USER_STORAGE_BYTES) {
        return fail(429, "quota", "You've reached your upload limit for now, try again in a few minutes.");
      }

      const key = newStorageKey(user.id, kind.ext);
      await storage.put(key, bytes, kind.mime);
      let row;
      try {
        row = await prisma.attachment.create({
          data: {
            tradeId: trade.id,
            url: key,
            kind: "screenshot",
            mimeType: kind.mime,
            sizeBytes: bytes.length,
          },
          select: { id: true },
        });
      } catch (err) {
        // The row didn't save: don't leave an orphan file behind.
        await storage.delete(key).catch(() => undefined);
        throw err;
      }
      await recomputeCompliance(user.id);
      return NextResponse.json({ ok: true, id: row.id });
    });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please choose a picture to upload." });
  }
});
