// Password reset + email alerts: single-use, expiry, neutral answers, dormant
// mode, other sessions signed out, and alert creation surviving a failing email.
// Runs against the throwaway test database (never the dev one).

import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { settleResetEmails, createResetToken, consumeResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "@/lib/password-reset";
import { verifyPassword, isTokenRevoked } from "@/lib/auth";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { sendEmail, isEmailEnabled, resetEmailWarningForTests } from "@/lib/email";
import { emailNewAlert } from "@/lib/email/alert-email";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) throw new Error(`Refusing to run against ${DB_URL}`);

// The routes read a cookie jar for the rate-limit key; give them a harmless one.
vi.mock("next/headers", () => {
  const store = new Map<string, { value: string }>();
  return {
    cookies: async () => ({
      get: (k: string) => store.get(k),
      set: (k: string, v: string) => void store.set(k, { value: v }),
      delete: (k: string) => void store.delete(k),
    }),
  };
});

const stamp = Date.now();
const email = `reset-${stamp}@example.com`;
const ghost = `ghost-${stamp}@example.com`;
let userId = "";
let ipCounter = 0;

function post(url: string, body: unknown) {
  // A different socket address per call keeps the per-visitor limit out of the way.
  ipCounter += 1;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tradeos-internal-socket-ip": `10.9.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

const fetchMock = vi.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  await prisma.passwordResetToken.deleteMany({ where: { userId: userId || "none" } });
  await prisma.user.deleteMany({ where: { email } });
  const u = await prisma.user.create({
    data: { email, passwordHash: "old-hash", plan: "free", billingStatus: "trialing" },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

function enableEmail() {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "TradeOS <hello@example.com>";
}

describe("reset tokens", () => {
  it("stores only a hash, valid for one hour", async () => {
    const token = await createResetToken(userId);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(token);
    const ttl = row!.expiresAt.getTime() - row!.createdAt.getTime();
    expect(Math.abs(ttl - RESET_TOKEN_TTL_MS)).toBeLessThan(5000);
  });

  it("works once, changes the password, and the second try is refused", async () => {
    const token = await createResetToken(userId);
    expect(await consumeResetToken(token, "brand-new-password-1")).toBe(true);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(await verifyPassword("brand-new-password-1", u!.passwordHash)).toBe(true);
    expect(await consumeResetToken(token, "another-password-22")).toBe(false);
    const u2 = await prisma.user.findUnique({ where: { id: userId } });
    expect(await verifyPassword("brand-new-password-1", u2!.passwordHash)).toBe(true);
  });

  it("two simultaneous tries: only one wins", async () => {
    const token = await createResetToken(userId);
    const results = await Promise.all([
      consumeResetToken(token, "password-number-one"),
      consumeResetToken(token, "password-number-two"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects an expired token and leaves the password alone", async () => {
    const token = await createResetToken(userId, new Date(Date.now() - 2 * RESET_TOKEN_TTL_MS));
    expect(await consumeResetToken(token, "brand-new-password-1")).toBe(false);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u!.passwordHash).toBe("old-hash");
  });

  it("rejects an unknown token", async () => {
    expect(await consumeResetToken("nope".repeat(16), "brand-new-password-1")).toBe(false);
  });

  it("a new request cancels the earlier link", async () => {
    const first = await createResetToken(userId);
    const second = await createResetToken(userId);
    expect(await consumeResetToken(first, "brand-new-password-1")).toBe(false);
    expect(await consumeResetToken(second, "brand-new-password-1")).toBe(true);
  });

  it("signs out other sessions and cancels the user's other tokens", async () => {
    const before = Math.floor(Date.now() / 1000) - 60; // a session issued a minute ago
    const token = await createResetToken(userId);
    // Plant a second unused token directly (as if it were left over).
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken("leftover"), expiresAt: new Date(Date.now() + 100000) },
    });
    expect(await consumeResetToken(token, "brand-new-password-1")).toBe(true);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(isTokenRevoked(before, u!.sessionsValidAfter)).toBe(true);
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(0);
  });
});

describe("routes", () => {
  it("forgot-password gives the identical answer for a real and a made-up address", async () => {
    enableEmail();
    const a = await forgot(post("/api/auth/forgot-password", { email }));
    const b = await forgot(post("/api/auth/forgot-password", { email: ghost }));
    await settleResetEmails();
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    // Only the real account got an email, and its token exists.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.to).toBe(email);
    expect(sent.html).toContain("/reset-password?token=");
  });

  it("dormant mode: no send, no crash, same neutral answer, no token kept", async () => {
    expect(isEmailEnabled()).toBe(false);
    const res = await forgot(post("/api/auth/forgot-password", { email }));
    await settleResetEmails();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);
  });

  it("replies without waiting for the account work (same path for real and made-up)", async () => {
    enableEmail();
    let release: (v: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
    // The send is stuck, yet the route still answers at once.
    const res = await forgot(post("/api/auth/forgot-password", { email }));
    expect(res.status).toBe(200);
    release(new Response("{}", { status: 200 }));
    await settleResetEmails();
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(1);
  });

  it("rejects a malformed address with 400", async () => {
    const res = await forgot(post("/api/auth/forgot-password", { email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("reset-password applies the sign-up password rule and a generic bad-link error", async () => {
    const token = await createResetToken(userId);
    const short = await reset(post("/api/auth/reset-password", { token, password: "short" }));
    expect(short.status).toBe(400);
    const bad = await reset(post("/api/auth/reset-password", { token: "wrong", password: "long-enough-pass" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/invalid or has expired/);
    const ok = await reset(post("/api/auth/reset-password", { token, password: "long-enough-pass" }));
    expect(ok.status).toBe(200);
    const again = await reset(post("/api/auth/reset-password", { token, password: "long-enough-pass" }));
    expect(again.status).toBe(400);
    expect((await again.json()).error).toMatch(/invalid or has expired/);
  });
});

describe("email transport and alert emails", () => {
  it("production without NEXT_PUBLIC_APP_URL keeps email dormant and warns once", async () => {
    enableEmail();
    const env = process.env as Record<string, string | undefined>;
    const saved = { n: env.NODE_ENV, u: env.NEXT_PUBLIC_APP_URL };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetEmailWarningForTests();
    try {
      env.NODE_ENV = "production";
      delete env.NEXT_PUBLIC_APP_URL;
      expect(isEmailEnabled()).toBe(false);
      expect(isEmailEnabled()).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      expect(isEmailEnabled()).toBe(true);
    } finally {
      env.NODE_ENV = saved.n;
      if (saved.u === undefined) delete env.NEXT_PUBLIC_APP_URL;
      else env.NEXT_PUBLIC_APP_URL = saved.u;
      warn.mockRestore();
    }
  });

  it("sendEmail never throws: dormant, network error, and Resend refusal all give false", async () => {
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    enableEmail();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 422 }));
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).toBe(false);
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).toBe(true);
  });

  it("emails a new alert (escaped), respects the off switch, and survives a throwing transport", async () => {
    enableEmail();
    await emailNewAlert(userId, { title: "Daily loss <b>80%</b>", message: "You are close." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.html).toContain("&lt;b&gt;80%&lt;/b&gt;");
    expect(sent.html).not.toContain("<b>80%</b>");

    await prisma.user.update({ where: { id: userId }, data: { emailAlerts: false } });
    await emailNewAlert(userId, { title: "x", message: "y" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await prisma.user.update({ where: { id: userId }, data: { emailAlerts: true } });
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(emailNewAlert(userId, { title: "x", message: "y" })).resolves.toBeUndefined();
  });
});
