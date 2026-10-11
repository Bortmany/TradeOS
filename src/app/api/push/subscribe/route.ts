// POST /api/push/subscribe — turn phone warnings on for THIS device.
//
// Session-checked, demo desk refused (a shared demo account must never collect
// real push addresses), behind USER_WRITE_LIMIT, zod on the body. The push
// address is typed by the browser, so it must be an https address on a known push
// service (src/lib/push/hosts.ts); anything else is refused with a generic line.
// Max 5 devices per person. Answers 503 "not_configured" until the owner's
// VAPID keys are set. The same browser signing in as someone else takes the
// subscription over, so the old person stops getting that device's warnings.

import { NextResponse } from "next/server";
import { withUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceUserRateLimit, USER_WRITE_LIMIT } from "@/lib/rate-limit";
import { refuseDemo } from "@/lib/demo-guard";
import { apiErrorResponse } from "@/lib/api-error";
import { isPushConfigured, MAX_PUSH_DEVICES } from "@/lib/push/config";
import { subscribeSchema } from "@/lib/push/validation";

export const POST = withUser(async (user, req: Request) => {
  const demoRefused = refuseDemo(user);
  if (demoRefused) return demoRefused;
  const limited = enforceUserRateLimit("push:subscribe", user.id, USER_WRITE_LIMIT);
  if (limited) return limited;

  if (!isPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Phone warnings aren't switched on for this site yet.", code: "not_configured" },
      { status: 503 }
    );
  }

  try {
    const { endpoint, keys } = subscribeSchema.parse(await req.json());

    const mine = await prisma.pushSubscription.findFirst({
      where: { userId: user.id, endpoint },
      select: { id: true },
    });
    if (!mine) {
      const count = await prisma.pushSubscription.count({ where: { userId: user.id } });
      if (count >= MAX_PUSH_DEVICES) {
        return NextResponse.json(
          {
            ok: false,
            error: `You've turned on alerts on ${MAX_PUSH_DEVICES} devices, the most we allow. Turn them off on one of your other devices first.`,
            code: "device_limit",
          },
          { status: 409 }
        );
      }
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err, { validationMessage: "That device can't receive phone warnings." });
  }
});
