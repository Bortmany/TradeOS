// TradeOS — email sending through Resend (dormant until keys are set).
//
// Without RESEND_API_KEY + EMAIL_FROM every email feature quietly sleeps: no
// alert emails, no password-reset links, and nothing breaks. The day the owner
// signs up at https://resend.com and sets the two variables, it lights up.
//
// - RESEND_API_KEY — Resend dashboard, "API Keys". Secret.
// - EMAIL_FROM     — the address mail comes from, e.g. "TradeOS <hello@yourdomain.com>".
//                    The domain must be verified inside Resend first.
//
// Plain REST call with fetch (no extra npm package). This is the ONLY place the
// server talks to api.resend.com (owner-approved host, see docs/CONVENTIONS.md).

import "server-only";
import { logger } from "@/lib/logger";

const RESEND_API_URL = "https://api.resend.com/emails";

// Read fresh on every call so a changed variable takes effect on restart.
export function getEmailEnv() {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() || null,
    from: process.env.EMAIL_FROM?.trim() || null,
  };
}

let warnedNoAppUrl = false;

/**
 * Email is on only when both the key and the from-address are set. In production
 * it also needs NEXT_PUBLIC_APP_URL, otherwise emailed links would point at
 * localhost; without it email stays dormant (one warning is logged).
 */
export function isEmailEnabled(): boolean {
  const env = getEmailEnv();
  if (!(env.apiKey && env.from)) return false;
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    if (!warnedNoAppUrl) {
      warnedNoAppUrl = true;
      logger.warn("Email is off: NEXT_PUBLIC_APP_URL is not set, so email links would be wrong");
    }
    return false;
  }
  return true;
}

/** Test helper: lets the one-time warning fire again. */
export function resetEmailWarningForTests() {
  warnedNoAppUrl = false;
}

export interface EmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

/** Make user-typed text safe inside an HTML email. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Public base address of the app, for links inside emails (no trailing slash). */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
}

// Send one email. NEVER throws: any problem is logged and answered with false,
// so a feature can never fail because an email did. True only when Resend
// accepted it. The body is never logged (reset links carry secrets).
export async function sendEmail({ to, subject, html }: EmailInput): Promise<boolean> {
  try {
    if (!isEmailEnabled()) return false;
    const { apiKey, from } = getEmailEnv();
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error("Email not sent", { status: res.status, detail: detail.slice(0, 200) });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Sending email failed", { err: err instanceof Error ? err.message : "unknown" });
    return false;
  }
}

/** Small shared wrapper so every TradeOS email looks the same. `bodyHtml` must already be escaped. */
export function emailLayout(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">${bodyHtml}<p style="margin-top:32px;font-size:12px;color:#666">TradeOS</p></div>`;
}
