// POST /api/push/test — "Send me a test": one sample notification to THIS device.
//
// Session-checked, demo desk refused, USER_WRITE_LIMIT plus 5 tests per hour per
// person, zod on the body. The device is looked up by (signed-in person, address),
// so another person's address answers 404 like an unknown one. A "gone" reply from
// the push service removes the subscription (410 here, so the page can say so).

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, userRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { refuseDemo } from "@/lib/demo-guard";
import { apiErrorResponse } from "@/lib/api-error";
import { isPushConfigured, MAX_TESTS_PER_HOUR } from "@/lib/push/config";
import { sendToSubscription } from "@/lib/push/send";
import { deviceSchema } from "@/lib/push/validation";

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("push:test", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;

  if (!isPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Phone warnings aren't switched on for this site yet.", code: "not_configured" },
      { status: 503 }
    );
  }

  try {
    const { endpoint } = deviceSchema.parse(await req.json());
    const sub = await prisma.pushSubscription.findFirst({
      where: { userId: user.id, endpoint },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (!sub) {
      return NextResponse.json({ ok: false, error: "Device not found.", code: "unknown_device" }, { status: 404 });
    }

    const hourly = userRateLimit("push:test-hour", user.id, {
      limit: MAX_TESTS_PER_HOUR,
      windowMs: 3_600_000,
    });
    if (!hourly.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `You've sent ${MAX_TESTS_PER_HOUR} tests this hour. Try again a bit later.`,
          code: "test_limit",
        },
        { status: 429, headers: { "Retry-After": String(hourly.retryAfter) } }
      );
    }

    const outcome = await sendToSubscription(sub, {
      title: "TradeOS",
      body: "This is a test. Your phone warnings are working.",
      url: "/dashboard",
      tag: "tradeos-test",
    });
    if (outcome === "sent") return NextResponse.json({ ok: true });
    if (outcome === "gone") {
      return NextResponse.json(
        { ok: false, error: "This device stopped accepting alerts. Turn them on again.", code: "gone" },
        { status: 410 }
      );
    }
    return NextResponse.json({ ok: false, error: "Couldn't send the test. Try again." }, { status: 502 });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "That device is not valid." });
  }
});
