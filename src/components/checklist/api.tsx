"use client";

// Small shared bits for the checklist screens: one fetch helper that always
// answers in plain English, and the demo-desk line.

import Link from "next/link";
import { Check, Info } from "lucide-react";

export type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function call<T = Record<string, unknown>>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<CallResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "Request failed." };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

/** The one line every saving control shows on the demo desk. */
export function DemoLine({ className }: { className?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span>
        The demo desk is look-around only.{" "}
        <Link href="/register" className="text-primary underline-offset-4 hover:underline">
          Create a free account
        </Link>{" "}
        to save your own.
      </span>
    </p>
  );
}

/** "Run saved" style confirmation: a polite live region that stays in the page. */
export function DoneLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {children ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      <span>{children}</span>
    </p>
  );
}

export const ERROR_BANNER =
  "rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss";
