// TradeOS — account deletion. Confirms the user's password, then deletes the
// User row; every relation in the schema cascades from User (accounts, trades,
// rulebooks, evaluations, snapshots, imports, prop trackers, alerts, broker
// connections, backtest runs, market datasets), so nothing of theirs is left
// behind. The session cookie is cleared so the browser is signed out
// immediately.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser, verifyPassword, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-error";
import { purgeStoredFiles } from "@/lib/attachments";
import { refuseDemo } from "@/lib/demo-guard";
import { MT5_FIRM_ID } from "@/lib/connectors/firms";
import { removeBridgeAccountsReport } from "@/lib/connectors/mt5-access";

const schema = z.object({ password: z.string().min(1) });

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
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

    // MT5 links also live at MetaApi (with the investor password it holds): remove them
    // there first. If MetaApi does not confirm, the deletion still goes ahead (a trader is
    // never trapped), and the MetaApi account ids are logged so the owner can remove them by
    // hand. The privacy page says so.
    const bridgeRows = await prisma.brokerConnection.findMany({
      where: { userId: user.id, broker: MT5_FIRM_ID },
      select: { externalAccountId: true },
    });
    const bridge = await removeBridgeAccountsReport(bridgeRows.map((r) => r.externalAccountId));
    if (bridge.result === "failed") {
      console.error(
        "[account-delete] MetaApi did not confirm removal; the account was deleted anyway. The owner must remove these bridge accounts at MetaApi:",
        bridge.failed.join(", ")
      );
    }

    // Stored screenshots go too (the rows go with the account).
    await purgeStoredFiles({ trade: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Shared helper keeps raw error text off the client and turns a bad-JSON
    // body into a clean 400.
    return apiErrorResponse(err, {
      validationMessage: "Please enter your password to confirm.",
    });
  }
});
