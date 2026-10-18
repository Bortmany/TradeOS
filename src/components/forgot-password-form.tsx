"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_ERROR, EMAIL_EXAMPLE, isPossibleEmail } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!isPossibleEmail(email)) {
      setError(EMAIL_ERROR);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card-highlight rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        {sent ? (
          <div role="status" className="mt-4 space-y-3 text-sm">
            <p>If an account exists for that email, we&apos;ve sent a link to reset the password.</p>
            <p className="text-muted-foreground">
              The link works once and expires in 1 hour. Nothing arrived? Check your spam folder.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to choose a new password.
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder={EMAIL_EXAMPLE}
                  autoComplete="email"
                  onChange={() => error && setError(null)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "forgot-error" : undefined}
                  className={error ? "border-loss" : undefined}
                />
              </div>
              {error && (
                <p
                  id="forgot-error"
                  role="alert"
                  className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
                >
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
