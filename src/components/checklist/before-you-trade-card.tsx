"use client";

// The dashboard card "Before you trade": tick what's true, save the run.
// Lighter than the score hero above it (no ring, no big number): the score
// stays the anchor. A checklist only reminds; it never blocks a trade.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistRun, type LastRunInfo } from "@/components/checklist/checklist-run";
import { StarterChecklistButton } from "@/components/checklist/starter-button";
import { DEMO_STARTER_TEMPLATE, type ChecklistTemplateDTO } from "@/lib/checklist";

export function BeforeYouTradeCard({
  templates,
  preselectId,
  lastRun,
  demo,
  loadFailed,
}: {
  templates: ChecklistTemplateDTO[];
  preselectId: string | null;
  lastRun: LastRunInfo | null;
  demo: boolean;
  loadFailed: boolean;
}) {
  const router = useRouter();
  const shown = templates.length === 0 && demo ? [DEMO_STARTER_TEMPLATE] : templates;

  return (
    <Card className="print:hidden">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Before you trade</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Tick what&apos;s true, then save the run.</p>
        </div>
        <Link
          href="/checklist"
          className="shrink-0 rounded-sm py-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Edit lists
        </Link>
      </CardHeader>
      <CardContent>
        {loadFailed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-loss">Couldn&apos;t load your checklist.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.refresh()}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm">No checklist yet. Even pilots use one.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <StarterChecklistButton />
              <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
                <Link href="/checklist?tab=lists">Write my own</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ChecklistRun
            templates={shown}
            preselectId={preselectId}
            matchesRulebook={preselectId !== null}
            lastRun={lastRun}
            demo={demo}
          />
        )}
      </CardContent>
    </Card>
  );
}
