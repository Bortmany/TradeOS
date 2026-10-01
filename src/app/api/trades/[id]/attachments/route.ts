// TradeOS — upload one screenshot to a trade the signed-in user owns.
//
// multipart/form-data, one field named "file". The picture's type is decided from
// its own bytes (PNG / JPEG / WebP only; the name and the claimed type are ignored),
// it must be 5 MB or less, a trade holds at most 5, a person at most 200 pictures
// and 500 MB. The body is read as a counted stream (the length must be declared and is
// never trusted). Pictures are stored with their hidden location data removed. The storage
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
import {
  MAX_IMAGE_BYTES,
  sniffImage,
  stripJpegMetadata,
  stripPngMetadata,
  stripWebpMetadata,
} from "@/lib/storage/image";
import { refuseDemo } from "@/lib/demo-guard";
import {
  MAX_SCREENSHOTS_PER_TRADE,
  MAX_SCREENSHOTS_PER_USER,
  MAX_USER_STORAGE_BYTES,
  QUOTA_MESSAGE,
  TRADE_FULL_MESSAGE,
  UPLOAD_RATE_LIMIT,
  createScreenshotWithinCaps,
  serializePerUser,
  userScreenshotUsage,
} from "@/lib/attachments";

export const runtime = "nodejs";

// The whole request (picture + multipart wrapping) may be a little over 5 MB.
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * Read the request body as a stream with a hard byte counter. Past `max` bytes the
 * stream is cancelled at once and null is returned, so an oversized (or lying)
 * upload is never held in memory in full.
 */
async function readBodyCapped(req: Request, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
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

    // The upload must say how big it is, and a huge claim is refused before reading.
    const lengthHeader = req.headers.get("content-length");
    if (lengthHeader === null || lengthHeader.trim() === "") {
      return fail(411, "length_required", "Your browser didn't say how big the picture is. Please try again.");
    }
    const declared = Number(lengthHeader);
    if (!Number.isInteger(declared) || declared < 0) {
      return fail(400, "bad_request", "Please choose a picture to upload.");
    }
    if (declared > MAX_BODY_BYTES) return fail(413, "too_big", "That picture is over 5 MB.");

    // Don't trust the claim: count the bytes as they arrive and stop past the cap,
    // before anything is parsed.
    const contentType = req.headers.get("content-type") ?? "";
    const body = await readBodyCapped(req, MAX_BODY_BYTES);
    if (!body) return fail(413, "too_big", "That picture is over 5 MB.");

    let file: FormDataEntryValue | null;
    try {
      file = (await new Response(new Uint8Array(body), { headers: { "content-type": contentType } }).formData()).get("file");
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

    // Location data off every picture. One we can't read cleanly is refused, never stored as is.
    const cleaned =
      kind.mime === "image/jpeg"
        ? stripJpegMetadata(raw)
        : kind.mime === "image/png"
          ? stripPngMetadata(raw)
          : stripWebpMetadata(raw);
    if (!cleaned) return fail(415, "bad_type", "That file isn't a PNG, JPEG or WebP picture.");
    const bytes: Buffer = cleaned;

    return await serializePerUser(user.id, async () => {
      const onTrade = await prisma.attachment.count({
        where: { tradeId: trade.id, kind: "screenshot" },
      });
      if (onTrade >= MAX_SCREENSHOTS_PER_TRADE) {
        return fail(409, "trade_full", TRADE_FULL_MESSAGE);
      }
      const usage = await userScreenshotUsage(user.id);
      if (usage.count >= MAX_SCREENSHOTS_PER_USER || usage.bytes + bytes.length > MAX_USER_STORAGE_BYTES) {
        return fail(429, "quota", QUOTA_MESSAGE);
      }

      const key = newStorageKey(user.id, kind.ext);
      await storage.put(key, bytes, kind.mime);
      // Saves the row and re-checks the caps with it counted; over a cap, the row
      // and the stored file are both removed. (Also removes the file on any failure.)
      const saved = await createScreenshotWithinCaps(user.id, {
        tradeId: trade.id,
        url: key,
        mimeType: kind.mime,
        sizeBytes: bytes.length,
      });
      if (!saved.ok) return fail(saved.status, saved.code, saved.message);
      await recomputeCompliance(user.id);
      return NextResponse.json({ ok: true, id: saved.id });
    });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "Please choose a picture to upload." });
  }
});
