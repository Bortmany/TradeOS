"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  ShieldCheck,
  Trophy,
  Menu,
  FileText,
  Wallet,
  Settings,
  CreditCard,
  Upload,
  ChevronRight,
  ListChecks,
  Calculator,
} from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
  { href: "/rules", label: "Rules", icon: ShieldCheck },
  { href: "/prop", label: "Prop", icon: Trophy },
] as const;

/** Pages reached through "More" (Import is also a top-bar button). */
const MORE_ITEMS = [
  { href: "/checklist", label: "Checklist", icon: ListChecks },
  { href: "/size", label: "Position size", icon: Calculator },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/billing", label: "Billing & Plan", icon: CreditCard },
  { href: "/import", label: "Import", icon: Upload },
] as const;

const MORE_PREFIXES = ["/checklist", "/size", "/reports", "/accounts", "/settings", "/import"];

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Which More row is the current page — the most specific match wins (Billing over Settings). */
function currentMoreHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of MORE_ITEMS) {
    if (matches(pathname, href) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

// Bar height (h-16 = 4rem) plus the phone's own safe-area inset. The sheet and
// its dimmed overlay stop here so the bar stays visible and tappable.
const ABOVE_BAR = "bottom-[calc(4rem+env(safe-area-inset-bottom))]";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const firstRowRef = useRef<HTMLAnchorElement>(null);

  // Any route change closes the sheet.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const tabMatched = ITEMS.some(({ href }) => matches(pathname, href));
  const moreActive = !tabMatched && MORE_PREFIXES.some((p) => matches(pathname, p));
  const currentMore = currentMoreHref(pathname);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* pointer-events-auto: the bar stays tappable while the sheet is open
          (a modal dialog switches pointer events off on the page body). */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        <nav aria-label="Main" className="flex h-16 items-stretch">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = matches(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap text-2xs font-medium transition-colors active:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "text-primary before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <DialogPrimitive.Trigger asChild>
            <button
              ref={moreRef}
              type="button"
              aria-label="More"
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap text-2xs font-medium transition-colors active:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                moreActive || open
                  ? "text-primary before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-primary"
                  : "text-muted-foreground"
              )}
            >
              <Menu className="h-5 w-5" />
              More
            </button>
          </DialogPrimitive.Trigger>
        </nav>
      </div>

      <DialogPortal>
        <DialogOverlay className={cn("bottom-auto top-0 md:hidden", ABOVE_BAR)} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Opening moves focus to the first row (Checklist); closing returns it
          // to the More button (Radix does that part).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstRowRef.current?.focus();
          }}
          // Tapping More again must close the sheet, not close-then-reopen it:
          // let the trigger's own click do the toggling.
          onPointerDownOutside={(e) => {
            if (moreRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (moreRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className={cn(
            "fixed inset-x-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border-t border-border bg-surface-overlay py-2 shadow-lg outline-none md:hidden",
            ABOVE_BAR,
            // Slide up (fade only when the phone asks for reduced motion).
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200",
            "motion-safe:data-[state=open]:slide-in-from-bottom-4 motion-safe:data-[state=closed]:slide-out-to-bottom-4"
          )}
        >
          <DialogTitle className="sr-only">More</DialogTitle>
          <nav aria-label="More pages">
            <ul>
              {MORE_ITEMS.map(({ href, label, icon: Icon }, i) => {
                const current = currentMore === href;
                return (
                  <li key={href} className="border-b border-border last:border-0">
                    <Link
                      ref={i === 0 ? firstRowRef : undefined}
                      href={href}
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 px-4 text-sm transition-colors active:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        current ? "text-primary" : "text-foreground"
                      )}
                    >
                      <Icon className={cn("h-5 w-5", current ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1">{label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
