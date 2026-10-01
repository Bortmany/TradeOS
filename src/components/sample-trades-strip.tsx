"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Dashboard line for traders whose trades are still the "Load sample data" set,
 * with a one-tap clear that removes only those sample trades.
 */
export function SampleTradesStrip() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(false), 3000);
    return () => clearTimeout(t);
  }, [cleared]);

  async function clearSamples() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-data", { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error("failed");
      setOpen(false);
      setCleared(true);
      router.refresh();
    } catch {
      setError("Couldn't clear the sample trades. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (cleared) {
    return (
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground print:hidden">
        Sample trades cleared.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          These are sample trades so you can look around. Import your own to replace them.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-10 shrink-0 sm:h-8"
          title="Remove only the sample trades"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Clear sample trades
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear sample trades?</DialogTitle>
            <DialogDescription>
              This removes only the sample trades. Trades you imported or entered yourself, and
              your rulebooks, stay. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearSamples} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Clearing…" : "Clear sample trades"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
