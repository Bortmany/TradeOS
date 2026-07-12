"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-loss-muted text-loss">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We hit an error rendering this view. Try again — if it persists, re-seed
        your data or reload.
      </p>
      <Button onClick={reset} className="mt-5">
        Try again
      </Button>
      {error.digest && (
        <p className="mt-4 text-2xs uppercase tracking-wide text-muted-foreground/60">
          Ref <span className="tabular normal-case">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
