"use client";

import { useEffect } from "react";
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
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We hit an error rendering this view. Try again — if it persists, re-seed
        your data or reload.
      </p>
      <Button onClick={reset} className="mt-5">
        Try again
      </Button>
    </div>
  );
}
