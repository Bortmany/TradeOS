"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One tap into the look-only demo desk. Signs in as the seeded demo user (no
 * password typed) and goes to the dashboard. Used on the landing page and the
 * sign-in page, so both behave the same.
 */
export function DemoDeskButton({
  label = "Explore the demo desk",
  size = "default",
  className,
}: {
  label?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(
          res.status === 429
            ? "Lots of people are looking around right now. Try again in a few minutes."
            : "Couldn't open the demo desk. Try again in a moment."
        );
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't open the demo desk. Try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={onClick}
        disabled={loading}
        title="Look around a sample account with trades already graded. Nothing you do there is saved."
        className="w-full sm:w-auto"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Opening the demo desk…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
