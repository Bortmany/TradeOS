"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMAIL_ERROR,
  EMAIL_EXAMPLE,
  NAME_EXAMPLE,
  isPossibleEmail,
} from "@/lib/validation";

/** Which box to outline in red, when the message says so. */
type ErrorField = "email" | "password" | "both" | null;

function fieldForError(message: string): ErrorField {
  const m = message.toLowerCase();
  if (m.includes("already exists")) return "email";
  if (m.includes("invalid email or password")) return "both";
  if (m.includes("password")) return "password";
  if (m.includes("email")) return "email";
  // Rate limits, network trouble and the like aren't any one field's fault.
  return null;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ErrorField>(null);
  const isRegister = mode === "register";

  // The moment the user starts fixing things, drop the red state — but an
  // email complaint only clears when the EMAIL box is edited, so typing a
  // password doesn't wipe the message the user still needs.
  function clearError(field?: "email" | "password") {
    if (!error) return;
    if (errorField === "email" && field === "password") return;
    setError(null);
    setErrorField(null);
  }

  // Catch an impossible address while the user is still looking at the box.
  function checkEmail(value: string) {
    if (value && !isPossibleEmail(value)) {
      setError(EMAIL_ERROR);
      setErrorField("email");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(isRegister ? { displayName: String(form.get("displayName") ?? "") } : {}),
    };

    // Never send an address that can't exist — same rule the server applies.
    if (!isPossibleEmail(payload.email)) {
      setError(EMAIL_ERROR);
      setErrorField("email");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Request failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setErrorField(fieldForError(message));
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card-highlight rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isRegister ? "Start your free trial" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isRegister
            ? "14 days of full access. No card required."
            : "Sign in to your trading desk."}
        </p>

        {/* noValidate: our own plain-English messages do the talking —
            without it the browser's built-in bubble pre-empts them. */}
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          {isRegister && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                name="displayName"
                placeholder={NAME_EXAMPLE}
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder={EMAIL_EXAMPLE}
              autoComplete="email"
              onChange={() => clearError("email")}
              onBlur={(e) => checkEmail(e.currentTarget.value)}
              aria-invalid={errorField === "email" || errorField === "both" || undefined}
              aria-describedby={
                errorField === "email" || errorField === "both" ? "auth-form-error" : undefined
              }
              className={
                errorField === "email" || errorField === "both" ? "border-loss" : undefined
              }
            />
            {error && errorField === "email" && (
              <p
                id="auth-form-error"
                role="alert"
                className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
              >
                {error}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              placeholder={isRegister ? "At least 8 characters" : "••••••••"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              onChange={() => clearError("password")}
              aria-invalid={errorField === "password" || errorField === "both" || undefined}
              aria-describedby={
                errorField === "password" || errorField === "both" ? "auth-form-error" : undefined
              }
              className={
                errorField === "password" || errorField === "both" ? "border-loss" : undefined
              }
            />
          </div>

          {error && errorField !== "email" && (
            <p
              id="auth-form-error"
              role="alert"
              className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
            >
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRegister ? "Create account" : "Sign in"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isRegister ? (
          <>
            Already trading with us?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to TradeOS?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Start free
            </Link>
          </>
        )}
      </p>

      {!isRegister && (
        <div className="mt-6 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-center text-xs text-muted-foreground">
          Demo account — <span className="font-mono text-foreground">demo@tradeos.app</span> /{" "}
          <span className="font-mono text-foreground">demo1234</span>
        </div>
      )}
    </div>
  );
}
