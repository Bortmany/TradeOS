"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { centreOf, resolveChoice, revealTheme } from "@/lib/theme-reveal";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // Picking an option reveals the new look in a circle that grows from the
  // theme button. Only animates when the visible look actually changes.
  function choose(value: (typeof OPTIONS)[number]["value"]) {
    const root = document.documentElement;
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = resolveChoice(value, systemIsDark);
    const now = root.classList.contains("dark") ? "dark" : "light";
    const save = () => flushSync(() => setTheme(value));
    if (next === now || !buttonRef.current) {
      save();
      return;
    }
    revealTheme(centreOf(buttonRef.current), () => {
      // next-themes updates <html> in an effect; set the class ourselves so the
      // new look is in place before the browser takes the "after" snapshot.
      root.classList.remove("light", "dark");
      root.classList.add(next);
      root.style.colorScheme = next;
      save();
    });
  }

  // Avoid a hydration mismatch: render a stable placeholder until mounted.
  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      {/* Hover hint so the icon-only button explains itself. */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                ref={buttonRef}
                variant="ghost"
                size="icon"
                aria-label="Change theme"
              >
                <Icon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Change theme</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => choose(option.value)}
            className={
              mounted && theme === option.value ? "text-primary" : undefined
            }
          >
            <option.icon className="mr-2 h-4 w-4" />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
