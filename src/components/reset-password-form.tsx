"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN, PASSWORD_SHORT_ERROR } from "@/lib/validation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < PASSWORD_MIN) {
      setError(PASSWORD_SHORT_ERROR);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card-highlight rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        {!token ? (
          <div role="alert" className="mt-4 space-y-3 text-sm">
            <p className="text-loss">This reset link is incomplete. Please ask for a new one.</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/forgot-password">Ask for a new link</Link>
            </Button>
          </div>
        ) : done ? (
          <div role="status" className="mt-4 space-y-3 text-sm">
            <p>Your password has been changed. You&apos;ve been signed out everywhere.</p>
            <Button asChild className="w-full">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={PASSWORD_MIN}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                onChange={() => error && setError(null)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "reset-error" : undefined}
                className={error ? "border-loss" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                required
                placeholder="Type it again"
                autoComplete="new-password"
                onChange={() => error && setError(null)}
              />
            </div>
            {error && (
              <div
                id="reset-error"
                role="alert"
                className="space-y-2 rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
              >
                <p>{error}</p>
                {error.toLowerCase().includes("reset link") && (
                  <Link href="/forgot-password" className="font-medium underline">
                    Ask for a new link
                  </Link>
                )}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </form>
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
