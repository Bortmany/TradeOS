// TradeOS — the one shared "the demo desk is look-around only" guard.
//
// The demo desk (demo@tradeos.app) signs in with one tap, so anyone can be in
// it. Every route that writes (POST, PUT, PATCH, DELETE) calls
// `refuseDemo(user)` right after it knows who is signed in and returns the
// result when it isn't null. `test/demo-read-only.test.ts` walks every route
// file and fails if a write route lacks the call.

import { NextResponse } from "next/server";
import { isDemoDesk } from "@/lib/demo-desk";

export const DEMO_WRITE_LINE =
  "The demo desk is look-around only. Create a free account to save your own.";

/** A friendly 403 when `user` is the demo desk, otherwise null (carry on). */
export function refuseDemo(user: { email: string | null | undefined }): NextResponse | null {
  if (!isDemoDesk(user.email)) return null;
  return NextResponse.json({ ok: false, error: DEMO_WRITE_LINE, code: "demo" }, { status: 403 });
}
