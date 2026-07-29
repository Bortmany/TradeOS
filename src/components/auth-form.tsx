"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(isRegister ? { displayName: String(form.get("displayName") ?? "") } : {}),
    };

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
      setError(err instanceof Error ? err.message : "Something went wrong.");
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

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {isRegister && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Name</Label>
              <Input id="displayName" name="displayName" placeholder="Your name" autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@email.com"
              autoComplete="email"
              className={error ? "border-loss" : undefined}
            />
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
              className={error ? "border-loss" : undefined}
            />
          </div>

          {error && (
            <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
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
