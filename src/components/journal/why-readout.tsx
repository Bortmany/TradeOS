"use client";

// WhyReadout — one line under the trade page's header so "why I entered" is the
// first thing read on a phone, where the Journal card sits at the bottom. Tapping
// it jumps to the field and puts the cursor there. It shows the SAVED text only.

import { PencilLine } from "lucide-react";

function jumpToField() {
  const el = document.getElementById("whyEntered") as HTMLTextAreaElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

export function WhyReadout({ text }: { text: string | null }) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return (
      <button
        type="button"
        onClick={jumpToField}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-start text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <PencilLine className="h-3.5 w-3.5" />
        Add why you entered
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={jumpToField}
      aria-label="Why I entered. Tap to edit."
      className="line-clamp-2 min-h-[44px] w-full text-start text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      Why I entered: &ldquo;{trimmed}&rdquo;
    </button>
  );
}
