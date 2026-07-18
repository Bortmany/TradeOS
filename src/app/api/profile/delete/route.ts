// TradeOS — account deletion. Confirms the user's password, then deletes the
// User row; every relation in the schema cascades from User (accounts, trades,
// rulebooks, evaluations, snapshots, imports, prop trackers, alerts, broker
// connections), so nothing of theirs is left behind. The session cookie is
// cleared so the browser is signed out immediately.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser, verifyPassword, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ password: z.string().min(1) });

export const POST = withUser(async (user, req: Request) => {
  // The password check makes this a guessing target — keep it as tight as login.
  const limit = rateLimit(`account-delete:${user.id}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { password } = schema.parse(await req.json());

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }
    const ok = await verifyPassword(password, dbUser.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 403 });
    }

    await prisma.user.delete({ where: { id: user.id } });
    await clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? "Please enter your password to confirm."
        : err instanceof Error
          ? err.message
          : "Failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
