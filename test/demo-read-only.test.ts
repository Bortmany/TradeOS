/// <reference types="vite/client" />
// The demo desk is look-around only. Its sign-in is one tap, so ANYONE can be in
// it: every route that writes must refuse it with the same friendly line.
//
// This test walks EVERY src/app/api/**/route.ts, finds each exported POST / PUT /
// PATCH / DELETE handler, and (a) fails if the file does not call the shared
// guard, and (b) actually calls the handler as the demo user and expects a 403
// with code "demo". A new write route with no guard fails here.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_EMAIL } from "@/lib/demo-desk";
import { DEMO_WRITE_LINE, refuseDemo } from "@/lib/demo-guard";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

// Stand in for the session: every way a route learns who is signed in returns
// the same user, so the walk reaches each handler's guard.
vi.mock("@/lib/auth", () => {
  const user = () => session.current as Record<string, unknown>;
  return {
    withUser:
      (handler: (u: unknown, ...a: unknown[]) => Promise<Response>) =>
      async (...args: unknown[]) =>
        handler(user(), ...args),
    requireUser: async () => user(),
    getCurrentUser: async () => user(),
    verifyPassword: async () => false,
    clearSessionCookie: async () => undefined,
    setSessionCookie: async () => undefined,
    signInDemo: async () => true,
    registerUser: async () => ({ created: false }),
    authenticate: async () => {
      throw new Error("Invalid email or password.");
    },
  };
});

// Routes that are not "a signed-in user saving something": the sign-in family
// (public by nature) and the payment provider's own webhook.
const EXEMPT = new Set([
  "auth/login",
  "auth/register",
  "auth/logout",
  "auth/demo",
  "billing/webhook",
]);
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

const modules = import.meta.glob("../src/app/api/**/route.ts") as Record<
  string,
  () => Promise<Record<string, unknown>>
>;
const keyOf = (path: string) => path.split("/api/")[1].replace(/\/route\.ts$/, "");

describe("demo desk is read-only on every write route", () => {
  it("finds the write routes (the walk is not empty)", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(25);
  });

  for (const [path, load] of Object.entries(modules)) {
    const key = keyOf(path);
    if (EXEMPT.has(key)) continue;
    const file = fileURLToPath(new URL(path, import.meta.url));
    const source = readFileSync(file, "utf8");
    const methods = WRITE_METHODS.filter((m) =>
      new RegExp(`export (const|async function) ${m}\\b`).test(source)
    );

    for (const method of methods) {
      it(`${method} /api/${key} refuses the demo desk with the friendly line`, async () => {
        expect(source, `${key} must call refuseDemo(user)`).toContain("refuseDemo(");
        session.current = { id: "demo-user-id", email: DEMO_EMAIL, plan: "pro", billingStatus: "active" };
        const mod = await load();
        const handler = mod[method] as (req: Request, ctx?: unknown) => Promise<Response>;
        const res = await handler(
          new Request(`http://localhost/api/${key}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
          { params: Promise.resolve({ id: "x" }) }
        );
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.code).toBe("demo");
        expect(body.error).toBe(DEMO_WRITE_LINE);
      });
    }
  }

  it("the guard lets a real trader through", () => {
    expect(refuseDemo({ email: "trader@example.com" })).toBeNull();
    expect(refuseDemo({ email: "  Demo@TradeOS.app " })?.status).toBe(403);
  });
});
