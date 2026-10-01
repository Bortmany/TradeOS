// "Why I entered" and trade screenshots, through the REAL routes against the
// throwaway database and the local-disk storage driver (a temp folder).
//
// Covers: only real PNG/JPEG/WebP pass (decided from the bytes, not the name),
// 5 MB / 5-per-trade / per-user caps, cross-user isolation (404 on fetch, delete
// and upload), GPS removed from JPEGs, delete really removes the file, the
// "screenshot required" rule passes after an upload and fails again after the
// delete with every other number unchanged, and whyEntered is saved per user.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
}));

const storageDir = mkdtempSync(join(tmpdir(), "tradeos-shots-"));
process.env.LOCAL_STORAGE_DIR = storageDir;

import { POST as uploadRoute } from "@/app/api/trades/[id]/attachments/route";
import { GET as getRoute, DELETE as deleteRoute } from "@/app/api/attachments/[id]/route";
import { PATCH as patchTrade, DELETE as deleteTrade } from "@/app/api/trades/[id]/route";
import { prisma } from "@/lib/db";
import { resetRateLimit } from "@/lib/rate-limit";
import { recomputeUserCompliance } from "@/lib/rules/recompute";
import { getStorage, isValidStorageKey, newStorageKey } from "@/lib/storage";
import { sniffImage, stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from "@/lib/storage/image";
import { readS3Settings } from "@/lib/storage/s3";
import { createLocalDriver } from "@/lib/storage/local";
import { MAX_USER_STORAGE_BYTES, createScreenshotWithinCaps } from "@/lib/attachments";

if ((process.env.DATABASE_URL ?? "").includes("dev.db")) {
  throw new Error("Refusing to run: DATABASE_URL points at the dev database.");
}

const stamp = Date.now();

// ---- picture fixtures --------------------------------------------------------
// A PNG chunk: length, type, data, CRC (the CRC bytes are a stand-in; nothing checks them).
function pngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.from([1, 2, 3, 4])]);
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
function png(extra = 0, before: Buffer[] = []): Buffer {
  return Buffer.concat([PNG_SIG, IHDR, ...before, pngChunk("IDAT", Buffer.alloc(extra, 7)), pngChunk("IEND")]);
}
// A WebP chunk: fourcc, little-endian length, data, padded to an even size.
function riffChunk(fourcc: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(fourcc, "latin1"), len, data, Buffer.alloc(data.length & 1)]);
}
function riff(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const head = Buffer.from("RIFF\0\0\0\0WEBP", "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
}
function webp(): Buffer {
  return riff(riffChunk("VP8 ", Buffer.alloc(10, 5)));
}
const SCAN = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]);
function jpegWithGps(): Buffer {
  // A tiny EXIF block: orientation 6 (rotated) plus a marker standing in for GPS data.
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), tiff, Buffer.from("GPSLatitude 23.5880 N GPSLongitude 58.3829 E")]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif]);
  const xmpBody = Buffer.from("http://ns.adobe.com/xap/1.0/\0<gps:GPSLatitude>23.58</gps:GPSLatitude>");
  const xmp = Buffer.concat([Buffer.from([0xff, 0xe1, (xmpBody.length + 2) >> 8, (xmpBody.length + 2) & 0xff]), xmpBody]);
  const app0 = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, xmp, SCAN]);
}

function uploadReq(tradeId: string, bytes: Buffer, name = "shot.png", type = "image/png"): Promise<Request> {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return formRequest(tradeId, form, true);
}
// Like a browser: the multipart body is already encoded, with its length declared.
async function encode(form: FormData) {
  const encoded = new Response(form);
  return { type: encoded.headers.get("content-type")!, body: Buffer.from(await encoded.arrayBuffer()) };
}
function formRequest(tradeId: string, form: FormData, withLength: boolean): Promise<Request> {
  return encode(form).then(
    ({ type, body }) =>
      new Request(`http://localhost/api/trades/${tradeId}/attachments`, {
        method: "POST",
        headers: { "content-type": type, ...(withLength ? { "content-length": String(body.length) } : {}) },
        body: new Uint8Array(body),
      })
  );
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const upload = async (tradeId: string, bytes: Buffer, name?: string, type?: string) =>
  uploadRoute(await uploadReq(tradeId, bytes, name, type), ctx(tradeId));
const getPic = (id: string) => getRoute(new Request("http://localhost/x"), ctx(id));
const delPic = (id: string) => deleteRoute(new Request("http://localhost/x", { method: "DELETE" }), ctx(id));
const patch = (id: string, body: unknown) =>
  patchTrade(
    new Request("http://localhost/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id)
  );

// ---- two traders ---------------------------------------------------------------
interface Trader {
  id: string;
  accountId: string;
  tradeId: string;
  otherTradeId: string;
}
let A: Trader;
let B: Trader;
let bookId = "";

async function makeTrader(label: string): Promise<Trader> {
  const user = await prisma.user.create({
    data: { email: `shots-${label}-${stamp}@example.com`, passwordHash: "x", displayName: label },
  });
  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, name: `${label} acct`, startingBalance: 10000 },
  });
  const mk = (n: number) =>
    prisma.trade.create({
      data: {
        userId: user.id,
        accountId: account.id,
        symbol: "MES",
        side: "long",
        entryPrice: 5000,
        exitPrice: 5010,
        quantity: 1,
        entryTime: new Date(`2026-09-1${n}T14:00:00Z`),
        exitTime: new Date(`2026-09-1${n}T14:30:00Z`),
        pnl: 50,
        source: "manual",
        externalId: `shots-${label}-${n}-${stamp}`,
      },
    });
  const t1 = await mk(1);
  const t2 = await mk(2);
  return { id: user.id, accountId: account.id, tradeId: t1.id, otherTradeId: t2.id };
}

function as(t: Trader, email?: string) {
  session.current = { id: t.id, email: email ?? `shots-${t === A ? "a" : "b"}-${stamp}@example.com` };
}

beforeAll(async () => {
  A = await makeTrader("a");
  B = await makeTrader("b");
});

beforeEach(() => {
  for (const t of [A, B]) {
    for (const k of ["attachments:write", "attachments:upload", "attachments:read", "trades:update", "trades:delete"]) {
      resetRateLimit(`${k}:user:${t.id}`);
    }
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  rmSync(storageDir, { recursive: true, force: true });
});

async function rowsFor(tradeId: string) {
  return prisma.attachment.findMany({ where: { tradeId }, orderBy: { createdAt: "asc" } });
}
function filesOnDisk(): number {
  if (!existsSync(storageDir)) return 0;
  return readdirSync(storageDir).reduce((n, d) => n + readdirSync(join(storageDir, d)).length, 0);
}

describe("what counts as a picture", () => {
  it("sniffs PNG, JPEG and WebP from the bytes, and nothing else", () => {
    expect(sniffImage(png())?.mime).toBe("image/png");
    expect(sniffImage(jpegWithGps())?.mime).toBe("image/jpeg");
    expect(sniffImage(webp())?.mime).toBe("image/webp");
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("just some text"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it("refuses a .png that is really text, HTML or SVG (extension and claimed type ignored)", async () => {
    as(A);
    const before = await rowsFor(A.tradeId);
    const files = filesOnDisk();
    for (const body of [
      Buffer.from("this is only text"),
      Buffer.from("<html><body>hi</body></html>"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
    ]) {
      const res = await upload(A.tradeId, body, "chart.png", "image/png");
      expect(res.status).toBe(415);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("That file isn't a PNG, JPEG or WebP picture.");
    }
    expect((await rowsFor(A.tradeId)).length).toBe(before.length);
    expect(filesOnDisk()).toBe(files);
  });

  it("refuses a real picture whose JPEG structure is broken", async () => {
    as(A);
    const res = await upload(A.tradeId, Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x50, 1, 2]), "x.jpg", "image/jpeg");
    expect(res.status).toBe(415);
  });
});

describe("size and count caps", () => {
  it("refuses a 6 MB picture", async () => {
    as(A);
    const res = await upload(A.tradeId, png(6 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("That picture is over 5 MB.");
    expect((await rowsFor(A.tradeId)).length).toBe(0);
  });

  it("refuses an upload that doesn't say how big it is", async () => {
    as(A);
    const form = new FormData();
    form.append("file", new File([new Uint8Array(png())], "a.png", { type: "image/png" }));
    const res = await uploadRoute(await formRequest(A.tradeId, form, false), ctx(A.tradeId));
    expect(res.status).toBe(411);
    expect((await res.json()).code).toBe("length_required");
    expect((await rowsFor(A.tradeId)).length).toBe(0);
  });

  it("stops reading a streamed body past ~5.5 MB, whatever length it claims", async () => {
    as(A);
    const files = filesOnDisk();
    const chunk = new Uint8Array(1024 * 1024);
    const totalChunks = 200; // would be 200 MB if read to the end
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= totalChunks) return controller.close();
        pulled++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request(`http://localhost/api/trades/${A.tradeId}/attachments`, {
      method: "POST",
      // A small, lying length: the counter, not the header, has to catch this.
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "1000" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const res = await uploadRoute(req, ctx(A.tradeId));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("That picture is over 5 MB.");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(totalChunks / 10); // aborted early, never buffered it all
    expect((await rowsFor(A.tradeId)).length).toBe(0);
    expect(filesOnDisk()).toBe(files);
  });

  it("allows 5 per trade and refuses the 6th", async () => {
    as(A);
    for (let i = 0; i < 5; i++) {
      const ok = await upload(A.otherTradeId, png(i + 1));
      expect(ok.status).toBe(200);
    }
    const sixth = await upload(A.otherTradeId, png(99));
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).error).toBe("This trade already has 5 screenshots.");
    expect((await rowsFor(A.otherTradeId)).length).toBe(5);
    // clean up so later tests start from none
    for (const r of await rowsFor(A.otherTradeId)) expect((await delPic(r.id)).status).toBe(200);
  });

  it("refuses an upload when the person's 500 MB is used up", async () => {
    as(B);
    const filler = await prisma.attachment.create({
      data: { tradeId: B.otherTradeId, url: "filler", kind: "screenshot", sizeBytes: MAX_USER_STORAGE_BYTES },
    });
    const res = await upload(B.tradeId, png());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/upload limit/);
    await prisma.attachment.delete({ where: { id: filler.id } });
    expect((await upload(B.tradeId, png())).status).toBe(200);
    for (const r of await rowsFor(B.tradeId)) await delPic(r.id);
  });

  it("rolls back a row that lands over a cap: row and stored file both removed", async () => {
    // The in-memory guard can't see a second server process, so the caps are
    // re-counted with the new row in place; this simulates the race losing.
    const racer = await makeTrader("racer");
    try {
      const save = async (tradeId: string, size: number) => {
        const key = newStorageKey(racer.id, "png");
        await getStorage()!.put(key, png(), "image/png");
        const result = await createScreenshotWithinCaps(racer.id, {
          tradeId, url: key, mimeType: "image/png", sizeBytes: size,
        });
        return { key, result };
      };
      // 5 fit on the trade; the 6th is rolled back with the trade-full message.
      for (let i = 0; i < 5; i++) expect((await save(racer.tradeId, 10)).result.ok).toBe(true);
      const sixth = await save(racer.tradeId, 10);
      expect(sixth.result).toMatchObject({ ok: false, code: "trade_full", status: 409, message: "This trade already has 5 screenshots." });
      expect(await getStorage()!.get(sixth.key)).toBeNull();
      expect((await rowsFor(racer.tradeId)).length).toBe(5);

      // Over the 500 MB per-person cap: rolled back with the limit message.
      const big = await save(racer.otherTradeId, MAX_USER_STORAGE_BYTES);
      expect(big.result).toMatchObject({ ok: false, code: "quota", status: 429 });
      expect(await getStorage()!.get(big.key)).toBeNull();
      expect((await rowsFor(racer.otherTradeId)).length).toBe(0);

      // Over the 200-picture cap.
      const tradeIds: string[] = [];
      for (let t = 0; t < 39; t++) {
        const made = await prisma.trade.create({
          data: {
            userId: racer.id, accountId: racer.accountId, symbol: "NQ", side: "long", entryPrice: 1, exitPrice: 2,
            quantity: 1, entryTime: new Date("2026-09-21T14:00:00Z"), exitTime: new Date("2026-09-21T15:00:00Z"),
            pnl: 1, source: "manual", externalId: `shots-racer-fill-${t}-${stamp}`,
          },
          select: { id: true },
        });
        tradeIds.push(made.id);
      }
      await prisma.attachment.createMany({
        data: Array.from({ length: 195 }, (_, i) => ({
          tradeId: tradeIds[Math.floor(i / 5)], url: `filler-${i}`, kind: "screenshot", sizeBytes: 1,
        })),
      });
      const many = await save(racer.otherTradeId, 10);
      expect(many.result).toMatchObject({ ok: false, code: "quota" });
      expect(await getStorage()!.get(many.key)).toBeNull();
      expect(await prisma.attachment.count({ where: { trade: { userId: racer.id } } })).toBe(200);
    } finally {
      await prisma.user.delete({ where: { id: racer.id } });
    }
  });

  it("slows a person who uploads too fast", async () => {
    const fast = await makeTrader("fast");
    session.current = { id: fast.id, email: `shots-fast-${stamp}@example.com` };
    let limited = 0;
    for (let i = 0; i < 22; i++) {
      resetRateLimit(`attachments:write:user:${fast.id}`);
      const res = await upload(fast.tradeId, Buffer.from("not a picture"));
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
    await prisma.user.delete({ where: { id: fast.id } });
  });

  it("never stores anything for the shared demo desk", async () => {
    as(A, "demo@tradeos.app");
    const res = await upload(A.tradeId, png());
    expect(res.status).toBe(403);
    expect((await rowsFor(A.tradeId)).length).toBe(0);
  });
});

describe("only the owner can reach a picture", () => {
  it("user B gets 404 to fetch, delete or upload to user A's trade and picture", async () => {
    as(A);
    const made = await upload(A.tradeId, png(5));
    expect(made.status).toBe(200);
    const { id } = await made.json();

    as(B);
    expect((await getPic(id)).status).toBe(404);
    expect((await delPic(id)).status).toBe(404);
    expect((await upload(A.tradeId, png(6))).status).toBe(404);

    // Still there, still A's.
    expect((await rowsFor(A.tradeId)).length).toBe(1);
    as(A);
    expect((await getPic(id)).status).toBe(200);
    expect((await delPic(id)).status).toBe(200);
  });

  it("answers 401 with no session", async () => {
    session.current = null;
    expect((await getPic("whatever")).status).toBe(401);
  });

  it("streams the picture with safe headers", async () => {
    as(A);
    const { id } = await (await upload(A.tradeId, png(10))).json();
    const res = await getPic(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(Buffer.from(await res.arrayBuffer()).equals(png(10))).toBe(true);
    await delPic(id);
  });
});

describe("location data and clean-up", () => {
  it("stores a JPEG with GPS location removed and the picture untouched", async () => {
    as(A);
    const original = jpegWithGps();
    expect(original.includes(Buffer.from("GPSLatitude"))).toBe(true);
    const res = await upload(A.tradeId, original, "photo.jpg", "image/jpeg");
    expect(res.status).toBe(200);
    const row = (await rowsFor(A.tradeId))[0];
    const stored = (await getStorage()!.get(row.url))!;
    expect(stored.includes(Buffer.from("GPS"))).toBe(false);
    expect(stored.includes(Buffer.from("xap"))).toBe(false);
    expect(stored.subarray(stored.length - SCAN.length).equals(SCAN)).toBe(true); // pixels byte for byte
    expect(sniffImage(stored)?.mime).toBe("image/jpeg");
    expect(row.sizeBytes).toBe(stored.length);
    // The "rotated" flag survives so portrait photos stay upright.
    expect(stored.includes(Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06]))).toBe(true);
    await delPic(row.id);
  });

  it("stripJpegMetadata refuses bytes that are not a whole JPEG", () => {
    expect(stripJpegMetadata(Buffer.from("nope"))).toBeNull();
    expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it("stores a PNG with GPS EXIF and XMP removed and the picture data identical", async () => {
    as(A);
    const gps = pngChunk("eXIf", Buffer.from("MM\0*GPSLatitude 23.5880 N GPSLongitude 58.3829 E"));
    const xmp = pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0<gps:GPSLatitude>23.58</gps:GPSLatitude>"));
    const text = pngChunk("tEXt", Buffer.from("Comment\0GPSLongitude 58.38"));
    const ztxt = pngChunk("zTXt", Buffer.from("Raw profile type exif\0\0GPS"));
    const original = png(40, [gps, xmp, text, ztxt]);
    expect(original.includes(Buffer.from("GPSLatitude"))).toBe(true);
    const res = await upload(A.tradeId, original, "shot.png", "image/png");
    expect(res.status).toBe(200);
    const row = (await rowsFor(A.tradeId))[0];
    const stored = (await getStorage()!.get(row.url))!;
    expect(stored.includes(Buffer.from("GPS"))).toBe(false);
    expect(stored.includes(Buffer.from("xmp"))).toBe(false);
    expect(stored.equals(png(40))).toBe(true); // header, IDAT (pixels) and IEND byte for byte
    expect(row.sizeBytes).toBe(stored.length);
    await delPic(row.id);
  });

  it("stores a WebP with GPS EXIF and XMP removed, flags and sizes fixed, picture identical", async () => {
    as(A);
    const vp8x = (flags: number) =>
      riffChunk("VP8X", Buffer.from([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const picture = riffChunk("VP8 ", Buffer.alloc(11, 9)); // odd size: padded
    const icc = riffChunk("ICCP", Buffer.from("color-profile"));
    const exif = riffChunk("EXIF", Buffer.from("MM\0*GPSLatitude 23.5880 N GPSLongitude 58.3829 E"));
    const xmp = riffChunk("XMP ", Buffer.from("<gps:GPSLatitude>23.58</gps:GPSLatitude>x")); // odd size
    const original = riff(vp8x(0x20 | 0x10 | 0x08 | 0x04), icc, picture, exif, xmp);
    expect(original.includes(Buffer.from("GPSLatitude"))).toBe(true);
    const res = await upload(A.tradeId, original, "shot.webp", "image/webp");
    expect(res.status).toBe(200);
    const row = (await rowsFor(A.tradeId))[0];
    const stored = (await getStorage()!.get(row.url))!;
    expect(stored.includes(Buffer.from("GPS"))).toBe(false);
    expect(stored.includes(Buffer.from("EXIF"))).toBe(false);
    expect(stored.includes(Buffer.from("XMP "))).toBe(false);
    // Exactly the same file minus the two chunks, with only the EXIF/XMP flags cleared.
    expect(stored.equals(riff(vp8x(0x20 | 0x10), icc, picture))).toBe(true);
    expect(stored.readUInt32LE(4)).toBe(stored.length - 8);
    expect(sniffImage(stored)?.mime).toBe("image/webp");
    await delPic(row.id);
  });

  it("refuses PNGs and WebPs that are cut off or malformed", async () => {
    const good = png(10);
    expect(stripPngMetadata(good)).not.toBeNull();
    expect(stripPngMetadata(good.subarray(0, good.length - 5))).toBeNull(); // cut off
    expect(stripPngMetadata(Buffer.concat([PNG_SIG, pngChunk("IDAT"), pngChunk("IEND")]))).toBeNull(); // no IHDR first
    expect(stripPngMetadata(Buffer.concat([PNG_SIG, IHDR, pngChunk("IDAT")]))).toBeNull(); // no IEND
    const ok = webp();
    expect(stripWebpMetadata(ok)).not.toBeNull();
    expect(stripWebpMetadata(ok.subarray(0, ok.length - 3))).toBeNull(); // shorter than RIFF says
    expect(stripWebpMetadata(riff(riffChunk("EXIF", Buffer.from("only metadata"))))).toBeNull();
    expect(stripWebpMetadata(riff(riffChunk("VP8 ", Buffer.alloc(4)), riffChunk("XMP ", Buffer.alloc(2))).subarray(0, 30))).toBeNull();
    const lying = Buffer.from(ok);
    lying.writeUInt32LE(0x7fffff00, 16); // a chunk claiming to be huge
    expect(stripWebpMetadata(lying)).toBeNull();

    as(A);
    for (const [bytes, name, type] of [
      [good.subarray(0, good.length - 5), "a.png", "image/png"],
      [lying, "b.webp", "image/webp"],
    ] as const) {
      expect((await upload(A.tradeId, Buffer.from(bytes), name, type)).status).toBe(415);
    }
    expect((await rowsFor(A.tradeId)).length).toBe(0);
  });

  it("delete removes the stored file and the row", async () => {
    as(A);
    const { id } = await (await upload(A.tradeId, png(3))).json();
    const row = (await rowsFor(A.tradeId))[0];
    expect(await getStorage()!.get(row.url)).not.toBeNull();
    expect((await delPic(id)).status).toBe(200);
    expect(await getStorage()!.get(row.url)).toBeNull();
    expect(await prisma.attachment.findUnique({ where: { id } })).toBeNull();
    expect((await getPic(id)).status).toBe(404);
  });

  it("deleting a trade removes its stored pictures too", async () => {
    as(A);
    const extra = await prisma.trade.create({
      data: {
        userId: A.id, accountId: A.accountId, symbol: "ES", side: "long", entryPrice: 1, exitPrice: 2,
        quantity: 1, entryTime: new Date("2026-09-20T14:00:00Z"), exitTime: new Date("2026-09-20T15:00:00Z"),
        pnl: 1, source: "manual", externalId: `shots-extra-${stamp}`,
      },
    });
    expect((await upload(extra.id, png(4))).status).toBe(200);
    const row = (await rowsFor(extra.id))[0];
    expect(await getStorage()!.get(row.url)).not.toBeNull();
    const res = await deleteTrade(new Request("http://localhost/x", { method: "DELETE" }), ctx(extra.id));
    expect(res.status).toBe(200);
    expect(await getStorage()!.get(row.url)).toBeNull();
  });
});

describe("storage keys and drivers", () => {
  it("keys are server-built and scoped to the user; anything else is refused", async () => {
    const key = newStorageKey("user_abc123", "png");
    expect(key.startsWith("user_abc123/")).toBe(true);
    expect(isValidStorageKey(key)).toBe(true);
    for (const bad of ["../etc/passwd", "a/../../b.png", "/abs/x.png", "u/x.png", "u/../x", "", "user/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg"]) {
      expect(isValidStorageKey(bad)).toBe(false);
    }
    const local = createLocalDriver();
    await expect(local.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow();
    await expect(local.get("../../etc/passwd")).rejects.toThrow();
  });

  it("picks the S3 driver only when all five settings are present", () => {
    const all = {
      S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      S3_REGION: "auto",
    } as unknown as NodeJS.ProcessEnv;
    expect(readS3Settings(all)).not.toBeNull();
    for (const missing of Object.keys(all)) {
      const partial = { ...all } as Record<string, string | undefined>;
      delete partial[missing];
      expect(readS3Settings(partial as unknown as NodeJS.ProcessEnv)).toBeNull();
    }
    expect(getStorage()?.name).toBe("local");
    const saved = { ...process.env };
    Object.assign(process.env, all);
    expect(getStorage()?.name).toBe("s3");
    for (const k of Object.keys(all)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    expect(getStorage()?.name).toBe("local");
  });
});

describe('the "screenshot required" rule follows the pictures', () => {
  it("fails with none, passes after an upload, fails again after the delete, nothing else moves", async () => {
    const book = await prisma.ruleBook.create({ data: { userId: A.id, name: "needs screenshot", isActive: true } });
    bookId = book.id;
    await prisma.rule.createMany({
      data: [
        {
          ruleBookId: book.id, name: "Screenshot required", type: "setup_validation", severity: "medium", weight: 1,
          config: JSON.stringify({ requireStrategyTag: false, requireNotes: false, requireScreenshot: true }),
        },
        { ruleBookId: book.id, name: "Max size", type: "max_contracts", severity: "medium", weight: 1, config: JSON.stringify({ maxContracts: 5 }) },
      ],
    });

    const shotRule = await prisma.rule.findFirst({ where: { ruleBookId: book.id, type: "setup_validation" } });
    async function state() {
      await recomputeUserCompliance(A.id);
      const trades = await prisma.trade.findMany({ where: { userId: A.id }, orderBy: { entryTime: "asc" } });
      const evals = await prisma.ruleEvaluation.findMany({ where: { userId: A.id } });
      const shot = evals.find((e) => e.tradeId === A.tradeId && e.ruleId === shotRule!.id);
      return {
        trades: trades.map((t) => ({ id: t.id, score: t.complianceScore, v: t.violationCount })),
        shotStatus: shot?.status,
      };
    }
    const byId = (s: Awaited<ReturnType<typeof state>>, id: string) => s.trades.find((t) => t.id === id)!;

    as(A);
    const before = await state();
    expect(before.shotStatus).toBe("fail");
    expect(byId(before, A.tradeId).v).toBeGreaterThan(0);

    const made = await upload(A.tradeId, png(2));
    expect(made.status).toBe(200);
    const { id } = await made.json();
    // The route itself re-ran the compliance check: no manual recompute needed.
    const afterUp = await prisma.trade.findUnique({ where: { id: A.tradeId } });
    expect(afterUp!.violationCount).toBe(0);
    const during = await state();
    expect(during.shotStatus).toBe("pass");
    expect(byId(during, A.tradeId).v).toBe(0);
    expect(byId(during, A.tradeId).score).toBeGreaterThan(byId(before, A.tradeId).score!);
    // The trade with no picture is untouched by someone else's upload.
    expect(byId(during, A.otherTradeId)).toEqual(byId(before, A.otherTradeId));

    expect((await delPic(id)).status).toBe(200);
    const afterDelRow = await prisma.trade.findUnique({ where: { id: A.tradeId } });
    expect(afterDelRow!.violationCount).toBeGreaterThan(0);
    const after = await state();
    expect(after.shotStatus).toBe("fail");
    // Same fixture, same numbers as before the upload.
    expect(after).toEqual(before);

    await prisma.ruleBook.delete({ where: { id: bookId } });
  });
});

describe("why I entered", () => {
  it("is saved with the journal, trimmed, and cleared by a blank", async () => {
    as(A);
    let res = await patch(A.tradeId, { whyEntered: "  Broke the opening range on volume.  " });
    expect(res.status).toBe(200);
    expect((await prisma.trade.findUnique({ where: { id: A.tradeId } }))!.whyEntered).toBe("Broke the opening range on volume.");
    res = await patch(A.tradeId, { whyEntered: "   " });
    expect(res.status).toBe(200);
    expect((await prisma.trade.findUnique({ where: { id: A.tradeId } }))!.whyEntered).toBeNull();
  });

  it("is capped at 2,000 characters", async () => {
    as(A);
    expect((await patch(A.tradeId, { whyEntered: "x".repeat(2000) })).status).toBe(200);
    expect((await patch(A.tradeId, { whyEntered: "x".repeat(2001) })).status).toBe(400);
    expect((await prisma.trade.findUnique({ where: { id: A.tradeId } }))!.whyEntered).toHaveLength(2000);
  });

  it("is user-scoped: another user cannot write it, and the owner's text is unchanged", async () => {
    as(A);
    await patch(A.tradeId, { whyEntered: "my reason" });
    as(B);
    const res = await patch(A.tradeId, { whyEntered: "overwritten" });
    expect(res.status).toBe(404);
    expect((await prisma.trade.findUnique({ where: { id: A.tradeId } }))!.whyEntered).toBe("my reason");
    const { getTradeDetail } = await import("@/lib/journal");
    expect((await getTradeDetail(B.id, A.tradeId))).toBeNull();
    expect((await getTradeDetail(A.id, A.tradeId))!.whyEntered).toBe("my reason");
  });
});
