// TradeOS — data export. Returns everything the signed-in user has stored, as
// one downloadable JSON file: profile (minus the password hash), trading
// accounts, trades, rulebooks + rules, prop-firm trackers, and weekly
// reviews. Broker
// connections are deliberately NOT included — they hold the encrypted API key,
// and broker credentials never leave the server in any form.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const GET = withUser(async (user) => {
  // A full export reads every row the user owns — keep it occasional. 5 / 10 min.
  const limit = rateLimit(`export:${user.id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Please wait a few minutes before exporting again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const [profile, accounts, trades, ruleBooks, propAccounts, weeklyReviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      // Everything except passwordHash (never leaves the server).
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        plan: true,
        billingStatus: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.tradingAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.trade.findMany({ where: { userId: user.id }, orderBy: { entryTime: "asc" } }),
    prisma.ruleBook.findMany({
      where: { userId: user.id },
      include: { rules: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.propAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    // The trader's own words from the guided weekly review — their writing, so
    // it belongs in their export.
    prisma.weeklyReview.findMany({ where: { userId: user.id }, orderBy: { weekStart: "asc" } }),
  ]);

  const filename = `tradeos-export-${new Date().toISOString().slice(0, 10)}.json`;
  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      profile,
      accounts,
      trades,
      ruleBooks,
      propAccounts,
      weeklyReviews,
    },
    { headers: { "Content-Disposition": `attachment; filename="${filename}"` } }
  );
});
