"use client";

// The /checklist page body: Run, My lists and Recent runs (phone tabs; on a
// laptop Recent runs sits beside the work). Reminds only: nothing here blocks a
// trade or touches the score.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hint } from "@/components/hint";
import { ChecklistEditor } from "@/components/checklist/checklist-editor";
import { ChecklistRun, type LastRunInfo } from "@/components/checklist/checklist-run";
import { DemoLine, DoneLine, ERROR_BANNER, call } from "@/components/checklist/api";
import { RecentRuns } from "@/components/checklist/recent-runs";
import { StarterChecklistButton } from "@/components/checklist/starter-button";
import { MAX_TEMPLATES_PER_USER, type ChecklistRunDTO, type ChecklistTemplateDTO } from "@/lib/checklist";

type Tab = "run" | "lists" | "runs";
type Editing = { kind: "none" } | { kind: "new" } | { kind: "edit"; id: string };

export function ChecklistManager({
  templates: initialTemplates,
  runs: initialRuns,
  hasMoreRuns: initialHasMore,
  rulebooks,
  lastRun,
  preselectId,
  demo,
  initialTab,
}: {
  templates: ChecklistTemplateDTO[];
  runs: ChecklistRunDTO[];
  hasMoreRuns: boolean;
  rulebooks: Array<{ id: string; name: string }>;
  lastRun: LastRunInfo | null;
  preselectId: string | null;
  demo: boolean;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [runs, setRuns] = useState(initialRuns);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Editing>({ kind: "none" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChecklistTemplateDTO | null>(null);

  useEffect(() => setTemplates(initialTemplates), [initialTemplates]);
  useEffect(() => {
    setRuns(initialRuns);
    setHasMore(initialHasMore);
  }, [initialRuns, initialHasMore]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const active = templates.filter((t) => t.isActive);
  const atLimit = templates.length >= MAX_TEMPLATES_PER_USER;
  const editingTemplate = editing.kind === "edit" ? (templates.find((t) => t.id === editing.id) ?? null) : null;

  async function patch(t: ChecklistTemplateDTO, body: Record<string, unknown>) {
    setError(null);
    setShowDemo(false);
    if (demo) {
      setShowDemo(true);
      return;
    }
    const res = await call(`/api/checklists/${t.id}`, "PATCH", body);
    if (!res.ok) {
      setError("Couldn't change your checklist. Check your connection and try again.");
      return;
    }
    router.refresh();
  }

  async function reallyDelete(t: ChecklistTemplateDTO) {
    if (demo) {
      setConfirmDelete(null);
      setShowDemo(true);
      return;
    }
    const res = await call(`/api/checklists/${t.id}`, "DELETE");
    setConfirmDelete(null);
    if (!res.ok) {
      setError("Couldn't delete your checklist. Check your connection and try again.");
      return;
    }
    setMessage("Checklist deleted.");
    router.refresh();
  }

  function onEditorDone(result: { saved?: ChecklistTemplateDTO; deletedId?: string }) {
    setEditing({ kind: "none" });
    setTab("lists");
    setMessage(result.saved ? "Checklist saved." : "Checklist deleted.");
    router.refresh();
  }

  function onRunsChange(next: ChecklistRunDTO[], more: boolean) {
    setRuns(next);
    setHasMore(more);
  }

  // ---- Editor replaces the list inside "My lists" (and the whole page body on an empty page)
  if (editing.kind !== "none") {
    return (
      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-6">
            <ChecklistEditor
              key={editing.kind === "edit" ? editing.id : "new"}
              template={editing.kind === "edit" ? editingTemplate : null}
              rulebooks={rulebooks}
              demo={demo}
              onDone={onEditorDone}
              onBack={() => {
                setEditing({ kind: "none" });
                setTab("lists");
              }}
            />
          </CardContent>
        </Card>
        <Card className="mt-6 hidden lg:mt-0 lg:block">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentRuns runs={runs} hasMore={hasMore} demo={demo} onRunsChange={onRunsChange} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks />}
          title="No checklist yet"
          description="Even pilots use one. Start with five questions and make them yours."
          steps={[
            { label: "Write or edit your questions" },
            { label: "Tick them before you trade" },
            { label: "Link the run to the trade afterwards" },
          ]}
          action={
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              <StarterChecklistButton />
              <Button type="button" variant="secondary" size="lg" onClick={() => setEditing({ kind: "new" })}>
                Write my own
              </Button>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-6">
      <div className="space-y-4 lg:col-span-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid h-11 w-full grid-cols-3 lg:grid-cols-2">
            <TabsTrigger value="run" className="h-9">
              Run
            </TabsTrigger>
            <TabsTrigger value="lists" className="h-9">
              My lists
            </TabsTrigger>
            <TabsTrigger value="runs" className="h-9 lg:hidden">
              Recent runs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="mt-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                {active.length > 0 ? (
                  <ChecklistRun
                    templates={active}
                    preselectId={preselectId}
                    matchesRulebook={preselectId !== null}
                    lastRun={lastRun}
                    demo={demo}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    All your checklists are turned off. Turn one on under My lists.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lists" className="mt-4 space-y-3">
            {templates.map((t, i) => (
              <div
                key={t.id}
                className="flex min-h-[64px] items-center gap-1 rounded-lg border border-border bg-surface-raised ps-3 pe-1 transition-colors hover:border-primary/40"
              >
                <button
                  type="button"
                  onClick={() => setEditing({ kind: "edit", id: t.id })}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="max-w-full truncate text-sm font-medium">{t.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                    {t.items.length} {t.items.length === 1 ? "item" : "items"}
                    {t.ruleBookName && <Badge variant="secondary">{t.ruleBookName}</Badge>}
                    {!t.isActive && <Badge variant="outline">Off</Badge>}
                  </span>
                </button>
                <DropdownMenu>
                  <Hint label="More actions">
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-label={`More actions for ${t.name}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                  </Hint>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ kind: "edit", id: t.id })}>Edit</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onSelect={() => patch(t, { move: "up" })}>
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={i === templates.length - 1} onSelect={() => patch(t, { move: "down" })}>
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => patch(t, { isActive: !t.isActive })}>
                      {t.isActive ? "Turn off" : "Turn on"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-loss focus:text-loss" onSelect={() => setConfirmDelete(t)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {error && (
              <p role="alert" className={ERROR_BANNER}>
                {error}
              </p>
            )}
            {showDemo && <DemoLine />}
            <DoneLine>{message}</DoneLine>
            {atLimit ? (
              <Hint label="You have 10 checklists, the most we keep. Delete one to make another." wrap>
                <Button type="button" variant="secondary" size="lg" disabled className="w-full">
                  <Plus />
                  New checklist
                </Button>
              </Hint>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setEditing({ kind: "new" })}
              >
                <Plus />
                New checklist
              </Button>
            )}
          </TabsContent>

          <TabsContent value="runs" className="mt-4 lg:hidden">
            <RecentRuns runs={runs} hasMore={hasMore} demo={demo} onRunsChange={onRunsChange} />
          </TabsContent>
        </Tabs>
      </div>

      <Card className="mt-6 hidden lg:mt-0 lg:block">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentRuns runs={runs} hasMore={hasMore} demo={demo} onRunsChange={onRunsChange} />
        </CardContent>
      </Card>

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &apos;{confirmDelete?.name}&apos;?</DialogTitle>
            <DialogDescription>
              Runs you&apos;ve already saved keep their own copy of these questions, so your history stays as it
              was.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => confirmDelete && reallyDelete(confirmDelete)}>
              Delete checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
