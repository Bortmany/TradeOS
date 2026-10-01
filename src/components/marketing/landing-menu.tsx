"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#discipline", label: "Discipline" },
  { href: "#pricing", label: "Pricing" },
] as const;

/**
 * Phone-only menu for the landing header (hidden from md up, where the links are
 * already in the header). The panel is NOT in a portal: this page is pinned
 * light, and a portal would escape that. It hangs from the sticky header.
 */
export function LandingMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRowRef = useRef<HTMLAnchorElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      firstRowRef.current?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label="Menu"
        title="Menu"
        aria-expanded={open}
        aria-controls="landing-menu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      {open && (
        <>
          {/* Transparent backdrop: a tap outside closes the menu. */}
          <div className="absolute inset-x-0 top-full z-40 h-screen" aria-hidden="true" onClick={() => setOpen(false)} />
          <nav
            id="landing-menu-panel"
            aria-label="Page sections"
            className="absolute inset-x-0 top-full z-50 border-b border-border bg-background shadow-md motion-safe:animate-rise-in"
          >
            {LINKS.map((l, i) => (
              <a
                key={l.href}
                ref={i === 0 ? firstRowRef : undefined}
                href={l.href}
                onClick={() => setOpen(false)}
                className="container flex h-[52px] items-center justify-between text-sm font-medium text-foreground active:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {l.label}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
