import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on every app page while signed in as the demo desk. Not dismissible:
 * it is a mode, not a notice. Scrolls away with the page and returns on the next.
 */
export function DemoBanner() {
  return (
    <div className="container max-w-7xl pt-4 print:hidden">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Demo desk: look-around only. Nothing you do here is saved.
        </p>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-10 shrink-0 sm:h-8"
          title="It's free. Your own trades and journal, saved."
        >
          <Link href="/register">Create a free account</Link>
        </Button>
      </div>
    </div>
  );
}
