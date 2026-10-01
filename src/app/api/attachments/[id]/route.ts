// TradeOS — one screenshot. GET streams the file, and only to its owner; DELETE
// removes the stored file and the row. Both look the picture up through its trade's
// owner, so someone else's picture is a plain 404 (never "forbidden", which would
// confirm it exists). Nothing is ever served from a path the caller supplied: the
// file is found by the key saved in our own database.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_READ_LIMIT } from "@/lib/rate-limit";
import { recomputeCompliance } from "@/lib/rules/recompute-compliance";
import { apiErrorResponse } from "@/lib/api-error";
import { getStorage, isValidStorageKey } from "@/lib/storage";
import { refuseDemo } from "@/lib/demo-guard";

export const runtime = "nodejs";

const SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function notFound() {
  return NextResponse.json({ ok: false, error: "Picture not found." }, { status: 404 });
}

export const GET = withUser(async (
  user,
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const limited = enforceUserRateLimit("attachments:read", user.id, USER_READ_LIMIT);
  if (limited) return limited;

  try {
    const { id } = await params;
    const row = await prisma.attachment.findFirst({
      where: { id, kind: "screenshot", trade: { userId: user.id } },
      select: { url: true, mimeType: true },
    });
    if (!row || !isValidStorageKey(row.url)) return notFound();
    const storage = getStorage();
    if (!storage) {
      return NextResponse.json({ ok: false, error: "Screenshots aren't switched on yet." }, { status: 503 });
    }
    const bytes = await storage.get(row.url);
    if (!bytes) return notFound();

    const type = row.mimeType && SAFE_TYPES.has(row.mimeType) ? row.mimeType : "application/octet-stream";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
});

export const DELETE = withUser(async (
  user,
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("attachments:write", user.id);
  if (limited) return limited;

  try {
    const { id } = await params;
    const row = await prisma.attachment.findFirst({
      where: { id, kind: "screenshot", trade: { userId: user.id } },
      select: { id: true, url: true },
    });
    if (!row) return notFound();

    const storage = getStorage();
    if (!storage) {
      return NextResponse.json({ ok: false, error: "Screenshots aren't switched on yet." }, { status: 503 });
    }
    // File first: if the storage call fails the row stays and the user can retry,
    // so a picture is never left stored with no row pointing at it.
    if (isValidStorageKey(row.url)) await storage.delete(row.url);
    await prisma.attachment.deleteMany({ where: { id: row.id } });
    await recomputeCompliance(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
});
