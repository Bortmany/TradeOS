"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  ShieldCheck,
  Wallet,
  Trophy,
  FileText,
  Settings,
  Upload,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/journal", label: "Trade Journal", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/rules", label: "Rule Engine", icon: ShieldCheck },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/prop", label: "Prop Firm", icon: Trophy },
  { href: "/reports", label: "Reports", icon: FileText },
] as const;

const SECONDARY = [
  { href: "/import", label: "Import Trades", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="hidden md:flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface sticky top-0">
      <div className="flex h-14 items-center gap-2 px-5 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <span className="font-semibold tracking-tight">TradeOS</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Trading
        </p>
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </ul>

        <p className="mt-6 px-2 pb-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {SECONDARY.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/settings/billing"
          className="block rounded-lg border border-border bg-surface-raised p-3 transition-colors hover:border-primary/40"
        >
          <p className="text-xs font-medium">Upgrade your edge</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Unlock the full rule engine & prop tracking.
          </p>
        </Link>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-accent text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        {label}
      </Link>
    </li>
  );
}
