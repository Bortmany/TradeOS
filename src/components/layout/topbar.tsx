"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ChevronDown, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface TopbarProps {
  user: { email: string; displayName: string | null; plan: string; billingStatus: string };
  trialDaysLeft: number | null;
}

export function Topbar({ user, trialDaysLeft }: TopbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = user.displayName || user.email.split("@")[0];
  const initials = name.slice(0, 2).toUpperCase();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <span className="font-semibold tracking-tight">TradeOS</span>
      </div>

      <div className="hidden flex-1 md:block" />

      <div className="flex items-center gap-2 md:gap-3">
        {trialDaysLeft !== null && trialDaysLeft >= 0 && (
          <Link href="/settings/billing" className="hidden sm:block">
            <Badge variant="info" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {trialDaysLeft} days left in trial
            </Badge>
          </Link>
        )}

        <Button asChild variant="secondary" size="sm" className="gap-1.5">
          <Link href="/import">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Link>
        </Button>

        <ThemeToggle />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-2xs font-semibold text-primary">
              {initials}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-fade-in">
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
                  <Badge
                    variant={user.plan === "free" ? "secondary" : "profit"}
                    className="mt-1.5 capitalize"
                  >
                    {user.plan} plan
                  </Badge>
                </div>
                <div className="p-1">
                  <MenuItem href="/settings">Settings</MenuItem>
                  <MenuItem href="/settings/billing">Billing & Plan</MenuItem>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-loss transition-colors hover:bg-loss-muted"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
      )}
    >
      {children}
    </Link>
  );
}
