"use client";

// "Use a starter checklist": makes the one editable list of five questions.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ERROR_BANNER, call } from "@/components/checklist/api";
import { STARTER_ITEMS, STARTER_NAME } from "@/lib/checklist";

export function StarterChecklistButton({
  variant = "default",
  onCreated,
}: {
  variant?: ButtonProps["variant"];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    const res = await call("/api/checklists", "POST", { name: STARTER_NAME, items: [...STARTER_ITEMS] });
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error === "Network error." || res.error === "Request failed."
          ? "Couldn't add the starter checklist. Check your connection and try again."
          : res.error
      );
      return;
    }
    onCreated?.();
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} size="lg" onClick={make} disabled={busy} className="w-full sm:w-auto">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding…
          </>
        ) : (
          "Use a starter checklist"
        )}
      </Button>
      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}
    </div>
  );
}
