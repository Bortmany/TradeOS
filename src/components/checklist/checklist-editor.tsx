"use client";

// ChecklistEditor — write or edit one checklist: a name, an optional rulebook,
// and 1 to 20 questions (each up to 140 characters). Runs already saved keep
// their own copy of the wording, so editing or deleting never changes history.

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hint } from "@/components/hint";
import { DemoLine, ERROR_BANNER, call } from "@/components/checklist/api";
import {
  MAX_ITEMS_PER_TEMPLATE,
  MAX_ITEM_LENGTH,
  MAX_NAME_LENGTH,
  type ChecklistTemplateDTO,
} from "@/lib/checklist";

interface Row {
  key: string;
  text: string;
}

let rowCounter = 0;
const newKey = () => `q${(rowCounter += 1)}`;

export interface ChecklistEditorProps {
  /** null = a new checklist. */
  template: ChecklistTemplateDTO | null;
  rulebooks: Array<{ id: string; name: string }>;
  demo?: boolean;
  /** Called after a save or delete. */
  onDone: (result: { saved?: ChecklistTemplateDTO; deletedId?: string }) => void;
  /** Go back to the list with nothing changed. */
  onBack: () => void;
}

export function ChecklistEditor({ template, rulebooks, demo = false, onDone, onBack }: ChecklistEditorProps) {
  const initialRows = useMemo<Row[]>(
    () =>
      template && template.items.length > 0
        ? template.items.map((i) => ({ key: newKey(), text: i.text }))
        : [{ key: newKey(), text: "" }],
    [template]
  );
  const initialName = template?.name ?? "";
  const initialBook = template?.ruleBookId ?? "none";

  const [name, setName] = useState(initialName);
  const [ruleBookId, setRuleBookId] = useState(initialBook);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const dirty =
    name !== initialName ||
    ruleBookId !== initialBook ||
    JSON.stringify(rows.map((r) => r.text)) !== JSON.stringify(initialRows.map((r) => r.text));

  function back() {
    if (dirty) setConfirmDiscard(true);
    else onBack();
  }

  function setText(key: string, text: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));
    setRowErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _gone, ...rest } = e;
      return rest;
    });
    setListError(null);
  }

  function move(index: number, by: -1 | 1) {
    setRows((rs) => {
      const to = index + by;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function remove(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setRowErrors((e) => {
      const { [key]: _gone, ...rest } = e;
      return rest;
    });
  }

  function add() {
    if (rows.length >= MAX_ITEMS_PER_TEMPLATE) return;
    const key = newKey();
    setRows((rs) => [...rs, { key, text: "" }]);
    setFocusKey(key);
    setListError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    setShowDemo(false);

    const trimmedName = name.trim();
    let ok = true;
    if (!trimmedName) {
      setNameError("Give your checklist a name.");
      ok = false;
    } else setNameError(null);

    const errors: Record<string, string> = {};
    let firstEmpty: string | null = null;
    for (const r of rows) {
      if (!r.text.trim()) {
        errors[r.key] = "Fill in this question or remove it.";
        firstEmpty ??= r.key;
      }
    }
    setRowErrors(errors);
    if (rows.length === 0) {
      setListError("Add at least one question.");
      ok = false;
    } else setListError(null);
    if (firstEmpty) {
      ok = false;
      document.getElementById(`cq-${firstEmpty}`)?.focus();
    }
    if (!ok) return;

    if (demo) {
      setShowDemo(true);
      return;
    }

    setSaving(true);
    const body = {
      name: trimmedName,
      ruleBookId: ruleBookId === "none" ? null : ruleBookId,
      items: rows.map((r) => r.text.trim()),
    };
    const res = template
      ? await call<{ template: ChecklistTemplateDTO }>(`/api/checklists/${template.id}`, "PATCH", body)
      : await call<{ template: ChecklistTemplateDTO }>("/api/checklists", "POST", body);
    setSaving(false);
    if (!res.ok) {
      setBanner(
        res.error === "Network error." || res.error === "Request failed."
          ? "Couldn't save your checklist. Check your connection and try again. Your changes are still here."
          : `${res.error} Your changes are still here.`
      );
      return;
    }
    onDone({ saved: res.data.template });
  }

  async function doDelete() {
    if (!template) return;
    if (demo) {
      setConfirmDelete(false);
      setShowDemo(true);
      return;
    }
    setDeleting(true);
    const res = await call(`/api/checklists/${template.id}`, "DELETE");
    setDeleting(false);
    if (!res.ok) {
      setConfirmDelete(false);
      setBanner("Couldn't delete your checklist. Check your connection and try again.");
      return;
    }
    setConfirmDelete(false);
    onDone({ deletedId: template.id });
  }

  return (
    <form ref={formRef} onSubmit={save} className="space-y-6" noValidate>
      <Button type="button" variant="ghost" size="sm" onClick={back} className="-ms-2">
        <ArrowLeft className="h-4 w-4" />
        My lists
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ck-name" className="text-sm font-medium">
            Checklist name
          </Label>
          <Input
            id="ck-name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Open-range setup"
            aria-invalid={nameError ? true : undefined}
            className={`text-base sm:text-sm ${nameError ? "border-loss" : ""}`}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          {nameError && <p className="text-xs text-loss">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ck-book" className="text-sm font-medium">
            Tied to a rulebook (optional)
          </Label>
          <Select value={ruleBookId} onValueChange={setRuleBookId}>
            <SelectTrigger id="ck-book" className="h-11 text-base sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not tied to a rulebook</SelectItem>
              {rulebooks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-2xs text-muted-foreground">
            If tied, it&apos;s pre-picked on your dashboard when that rulebook applies to the account you&apos;re
            looking at.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Questions</Label>
          <span className="text-2xs tabular text-muted-foreground">
            {rows.length} of {MAX_ITEMS_PER_TEMPLATE}
          </span>
        </div>
        <ul className="space-y-3">
          {rows.map((r, i) => {
            const err = rowErrors[r.key];
            return (
              <li key={r.key} className="group space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      id={`cq-${r.key}`}
                      value={r.text}
                      maxLength={MAX_ITEM_LENGTH}
                      autoFocus={focusKey === r.key}
                      placeholder="e.g. Is my stop placed?"
                      aria-label={`Question ${i + 1}`}
                      aria-invalid={err ? true : undefined}
                      className={`text-base sm:text-sm ${err ? "border-loss" : ""}`}
                      onChange={(e) => setText(r.key, e.target.value)}
                    />
                    {r.text.length >= 120 && (
                      <p
                        className={`text-2xs tabular ${
                          r.text.length >= MAX_ITEM_LENGTH ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {r.text.length} / {MAX_ITEM_LENGTH}
                      </p>
                    )}
                    {err && <p className="text-xs text-loss">{err}</p>}
                  </div>
                  {/* Laptop: every row shows its three small buttons. */}
                  <div className="hidden shrink-0 items-center gap-1 md:flex">
                    <Hint label="Move up">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move question ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp />
                      </Button>
                    </Hint>
                    <Hint label="Move down">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move question ${i + 1} down`}
                        disabled={i === rows.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown />
                      </Button>
                    </Hint>
                    <Hint label="Remove this question">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove question ${i + 1}`}
                        onClick={() => remove(r.key)}
                      >
                        <Trash2 />
                      </Button>
                    </Hint>
                  </div>
                </div>
                {/* Phone: only the question being edited shows its toolbar. */}
                <div className="hidden gap-2 group-focus-within:flex md:!hidden">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="flex-1 px-2"
                  >
                    <ChevronUp />
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    className="flex-1 px-2"
                  >
                    <ChevronDown />
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => remove(r.key)}
                    className="flex-1 px-2"
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {listError && <p className="text-xs text-loss">{listError}</p>}
        {rows.length >= MAX_ITEMS_PER_TEMPLATE ? (
          <Hint label="20 questions is the limit. Remove one to add another." wrap>
            <Button type="button" variant="ghost" size="sm" disabled>
              <Plus />
              Add question
            </Button>
          </Hint>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={add}>
            <Plus />
            Add question
          </Button>
        )}
      </div>

      {banner && (
        <p role="alert" className={ERROR_BANNER}>
          {banner}
        </p>
      )}
      {showDemo && <DemoLine />}

      {/* Phone: the pair sits just above the bottom bar so it is always reachable. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <Button type="submit" size="lg" disabled={saving} className="w-full md:w-auto">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save checklist"
          )}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={back} disabled={saving} className="w-full md:w-auto">
          Cancel
        </Button>
      </div>

      {template && (
        <div className="border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            className="text-loss hover:text-loss"
          >
            <Trash2 />
            Delete checklist
          </Button>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &apos;{template?.name}&apos;?</DialogTitle>
            <DialogDescription>
              Runs you&apos;ve already saved keep their own copy of these questions, so your history stays as it
              was.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete checklist"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard your changes?</DialogTitle>
            <DialogDescription>What you typed in this checklist won&apos;t be saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                onBack();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
