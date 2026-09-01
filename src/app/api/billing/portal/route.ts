import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  BILLING_NOT_CONFIGURED,
  PaddleError,
  createPortalUrl,
  paddleConfig,
} from "@/lib/billing/paddle";
import { enforceUserRateLimit, USER_EXTERNAL_LIMIT } from "@/lib/rate-limit";

// Opens the payment provider's customer portal so subscribers can update their
// card, or cancel. A FRESH address is minted on every press — these links are
// single-use and short-lived, so one is never cached, stored, or logged.
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // Tight limit: each call reaches out to the payment provider.
  const limited = enforceUserRateLimit("billing:portal", user.id, USER_EXTERNAL_LIMIT);
  if (limited) return limited;

  const config = paddleConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: BILLING_NOT_CONFIGURED });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { paddleCustomerId: true, paddleSubscriptionId: true },
  });
  if (!dbUser?.paddleCustomerId) {
    return NextResponse.json({
      ok: false,
      message:
        "We don't have a subscription on file for your account yet. If you've just paid, give it a minute and refresh.",
    });
  }

  try {
    const url = await createPortalUrl(
      config,
      dbUser.paddleCustomerId,
      dbUser.paddleSubscriptionId
    );
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message =
      err instanceof PaddleError
        ? err.message
        : "We couldn't open your billing page. Please try again in a moment.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
