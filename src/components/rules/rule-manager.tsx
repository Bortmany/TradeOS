"use client";

// TradeOS — Rule Engine interactive layer.
// Small client components the (server) /rules page drops in for every mutation:
//   • NewRuleBookButton      — create-rulebook dialog
//   • RuleBookActiveToggle   — flip a book active/inactive
//   • RuleBookDeleteButton   — delete a book
//   • AddRuleButton          — add a rule to a book (type-driven config form)
//   • RuleRowActions         — edit / delete a single rule
// All call the JSON APIs then router.refresh() to re-render server data.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RULE_TYPES, SEVERITIES, type RuleType, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  time_window: "Time Window",
  risk_limit: "Risk Limit",
  max_trades: "Max Trades",
  max_contracts: "Max Contracts",
  max_daily_loss: "Daily Loss",
  indicator: "Indicator",
  behavioral: "Behavioral",
  setup_validation: "Setup Validation",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const SCOPES = [
  { value: "all", label: "All trades" },
  { value: "strategy", label: "Strategy tag" },
  { value: "account", label: "Account" },
] as const;

// --------------------------------------------------------------------------
// shared fetch helper
// --------------------------------------------------------------------------

async function mutate(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Request failed." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

// --------------------------------------------------------------------------
// New rulebook
// --------------------------------------------------------------------------

export function NewRuleBookButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [scopeValue, setScopeValue] = useState("");

  function reset() {
    setName("");
    setDescription("");
    setScope("all");
    setScopeValue("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await mutate("/api/rulebooks", "POST", {
      name,
      description: description || null,
      scope,
      scopeValue: scope === "all" ? null : scopeValue || null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Failed.");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Rulebook
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New rulebook</DialogTitle>
          <DialogDescription>
            Group related rules. Scope decides which trades it applies to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rb-name">Name</Label>
            <Input
              id="rb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Morning session discipline"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rb-desc">Description</Label>
            <Textarea
              id="rb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this rulebook."
              className="min-h-[60px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scope !== "all" && (
              <div className="space-y-1.5">
                <Label htmlFor="rb-scopeval">
                  {scope === "strategy" ? "Strategy tag" : "Account id"}
                </Label>
                <Input
                  id="rb-scopeval"
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                  placeholder={scope === "strategy" ? "vwap_reclaim" : "account id"}
                />
              </div>
            )}
          </div>
          {error && <FormError message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create rulebook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Rulebook active toggle & delete
// --------------------------------------------------------------------------

export function RuleBookActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(isActive);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !on;
    setPending(true);
    setOn(next);
    const res = await mutate("/api/rulebooks", "PATCH", { id, isActive: next });
    setPending(false);
    if (!res.ok) {
      setOn(!next); // revert
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Deactivate rulebook" : "Activate rulebook"}
      onClick={toggle}
      disabled={pending}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-1 ring-border transition-transform",
          on ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function RuleBookDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setLoading(true);
    const res = await mutate("/api/rulebooks", "DELETE", { id });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Hover hint so the icon-only button explains itself. */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-loss"
              aria-label="Delete rulebook"
              onClick={() => setOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete rulebook</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete rulebook</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{name}&rdquo; and all its rules? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Rule create / edit dialog (type-driven config form)
// --------------------------------------------------------------------------

export interface RuleInit {
  id: string;
  name: string;
  type: RuleType;
  severity: string;
  weight: number;
  config: string; // raw JSON string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

function safeParse(json: string): Cfg {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function defaultsFor(type: RuleType, existing?: Cfg): Cfg {
  const e = existing ?? {};
  const s = (v: unknown, d: string) => (v != null ? String(v) : d);
  switch (type) {
    case "time_window":
      return { start: e.start ?? "09:30", end: e.end ?? "11:30", timezone: e.timezone ?? "America/New_York" };
    case "risk_limit":
      return { maxLossPerTrade: s(e.maxLossPerTrade, ""), maxRiskPct: s(e.maxRiskPct, "") };
    case "max_trades":
      return { maxPerDay: s(e.maxPerDay, "5") };
    case "max_contracts":
      return { maxContracts: s(e.maxContracts, "3") };
    case "max_daily_loss":
      return { maxDailyLoss: s(e.maxDailyLoss, "1000") };
    case "behavioral":
      return {
        kind: e.kind ?? "revenge_trading",
        withinMinutes: s(e.withinMinutes, "5"),
        threshold: s(e.threshold, "3"),
        windowMinutes: s(e.windowMinutes, "15"),
      };
    case "indicator":
      return { requireTag: e.requireTag ?? "" };
    case "setup_validation":
      return {
        requireStrategyTag: e.requireStrategyTag ?? true,
        requireNotes: e.requireNotes ?? false,
        requireScreenshot: e.requireScreenshot ?? false,
      };
    default:
      return {};
  }
}

function buildConfig(type: RuleType, c: Cfg): Cfg {
  const num = (v: unknown) => Number(v);
  switch (type) {
    case "time_window":
      return { start: c.start, end: c.end, timezone: c.timezone };
    case "risk_limit": {
      const out: Cfg = {};
      if (c.maxLossPerTrade !== "" && c.maxLossPerTrade != null) out.maxLossPerTrade = num(c.maxLossPerTrade);
      if (c.maxRiskPct !== "" && c.maxRiskPct != null) out.maxRiskPct = num(c.maxRiskPct);
      return out;
    }
    case "max_trades":
      return { maxPerDay: num(c.maxPerDay) };
    case "max_contracts":
      return { maxContracts: num(c.maxContracts) };
    case "max_daily_loss":
      return { maxDailyLoss: num(c.maxDailyLoss) };
    case "behavioral":
      return {
        kind: c.kind,
        withinMinutes: num(c.withinMinutes),
        threshold: num(c.threshold),
        windowMinutes: num(c.windowMinutes),
      };
    case "indicator":
      return { requireTag: c.requireTag };
    case "setup_validation":
      return {
        requireStrategyTag: !!c.requireStrategyTag,
        requireNotes: !!c.requireNotes,
        requireScreenshot: !!c.requireScreenshot,
      };
    default:
      return {};
  }
}

function RuleFormDialog({
  bookId,
  rule,
  open,
  onOpenChange,
}: {
  bookId: string;
  rule?: RuleInit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const editing = !!rule;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(rule?.name ?? "");
  const [type, setType] = useState<RuleType>(rule?.type ?? "time_window");
  const [severity, setSeverity] = useState<string>(rule?.severity ?? "medium");
  const [weight, setWeight] = useState(String(rule?.weight ?? 1));
  const [cfg, setCfg] = useState<Cfg>(() =>
    defaultsFor(rule?.type ?? "time_window", rule ? safeParse(rule.config) : undefined)
  );

  function onTypeChange(t: string) {
    const rt = t as RuleType;
    setType(rt);
    setCfg(defaultsFor(rt));
  }

  function setField(key: string, value: unknown) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const config = buildConfig(type, cfg);
    const res = editing
      ? await mutate("/api/rules", "PATCH", {
          id: rule!.id,
          name,
          type,
          severity,
          weight: Number(weight),
          config,
        })
      : await mutate("/api/rules", "POST", {
          ruleBookId: bookId,
          name,
          type,
          severity,
          weight: Number(weight),
          config,
        });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Failed.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "Add rule"}</DialogTitle>
          <DialogDescription>
            Rules are evaluated deterministically against every trade in scope.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="No trading before the open"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={onTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RULE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* type-driven config */}
          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <ConfigFields type={type} cfg={cfg} setField={setField} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-weight">Weight</Label>
            <Input
              id="r-weight"
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-28"
            />
          </div>

          {error && <FormError message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save rule" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfigFields({
  type,
  cfg,
  setField,
}: {
  type: RuleType;
  cfg: Cfg;
  setField: (key: string, value: unknown) => void;
}) {
  switch (type) {
    case "time_window":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start">
            <Input type="time" value={cfg.start ?? ""} onChange={(e) => setField("start", e.target.value)} />
          </Field>
          <Field label="End">
            <Input type="time" value={cfg.end ?? ""} onChange={(e) => setField("end", e.target.value)} />
          </Field>
          <Field label="Timezone">
            <Select value={cfg.timezone ?? "America/New_York"} onValueChange={(v) => setField("timezone", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">ET (New York)</SelectItem>
                <SelectItem value="America/Chicago">CT (Chicago)</SelectItem>
                <SelectItem value="America/Denver">MT (Denver)</SelectItem>
                <SelectItem value="America/Los_Angeles">PT (Los Angeles)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );
    case "risk_limit":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max loss / trade ($)">
            <Input
              type="number"
              min={0}
              step="any"
              value={cfg.maxLossPerTrade ?? ""}
              onChange={(e) => setField("maxLossPerTrade", e.target.value)}
              placeholder="500"
            />
          </Field>
          <Field label="Max risk (% of account)">
            <Input
              type="number"
              min={0}
              step="any"
              value={cfg.maxRiskPct ?? ""}
              onChange={(e) => setField("maxRiskPct", e.target.value)}
              placeholder="1"
            />
          </Field>
        </div>
      );
    case "max_trades":
      return (
        <Field label="Max trades per day">
          <Input
            type="number"
            min={1}
            value={cfg.maxPerDay ?? ""}
            onChange={(e) => setField("maxPerDay", e.target.value)}
          />
        </Field>
      );
    case "max_contracts":
      return (
        <Field label="Max contracts per trade">
          <Input
            type="number"
            min={1}
            step="any"
            value={cfg.maxContracts ?? ""}
            onChange={(e) => setField("maxContracts", e.target.value)}
          />
        </Field>
      );
    case "max_daily_loss":
      return (
        <Field label="Max daily loss ($)">
          <Input
            type="number"
            min={0}
            step="any"
            value={cfg.maxDailyLoss ?? ""}
            onChange={(e) => setField("maxDailyLoss", e.target.value)}
          />
        </Field>
      );
    case "behavioral":
      return (
        <div className="space-y-3">
          <Field label="Behavior">
            <Select value={cfg.kind ?? "revenge_trading"} onValueChange={(v) => setField("kind", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenge_trading">Revenge trading</SelectItem>
                <SelectItem value="overtrading">Overtrading</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {cfg.kind === "overtrading" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Trade threshold">
                <Input
                  type="number"
                  min={1}
                  value={cfg.threshold ?? ""}
                  onChange={(e) => setField("threshold", e.target.value)}
                />
              </Field>
              <Field label="Window (minutes)">
                <Input
                  type="number"
                  min={1}
                  value={cfg.windowMinutes ?? ""}
                  onChange={(e) => setField("windowMinutes", e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <Field label="Re-entry window (minutes)">
              <Input
                type="number"
                min={1}
                value={cfg.withinMinutes ?? ""}
                onChange={(e) => setField("withinMinutes", e.target.value)}
              />
            </Field>
          )}
        </div>
      );
    case "indicator":
      return (
        <Field label="Required tag">
          <Input
            value={cfg.requireTag ?? ""}
            onChange={(e) => setField("requireTag", e.target.value)}
            placeholder="vwap_reclaim"
          />
        </Field>
      );
    case "setup_validation":
      return (
        <div className="space-y-2">
          <CheckboxRow
            label="Require strategy tag"
            checked={!!cfg.requireStrategyTag}
            onChange={(v) => setField("requireStrategyTag", v)}
          />
          <CheckboxRow
            label="Require notes"
            checked={!!cfg.requireNotes}
            onChange={(v) => setField("requireNotes", v)}
          />
          <CheckboxRow
            label="Require screenshot"
            checked={!!cfg.requireScreenshot}
            onChange={(v) => setField("requireScreenshot", v)}
          />
        </div>
      );
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-surface accent-primary"
      />
      {label}
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
      {message}
    </p>
  );
}

// --------------------------------------------------------------------------
// Per-book "Add rule" button
// --------------------------------------------------------------------------

export function AddRuleButton({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add rule
      </Button>
      {open && <RuleFormDialog bookId={bookId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

// --------------------------------------------------------------------------
// Per-row edit / delete
// --------------------------------------------------------------------------

export function RuleRowActions({ bookId, rule }: { bookId: string; rule: RuleInit }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirmDelete() {
    setLoading(true);
    const res = await mutate("/api/rules", "DELETE", { id: rule.id });
    setLoading(false);
    if (res.ok) {
      setDelOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Hover hints so the icon-only buttons explain themselves. */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Edit rule"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit rule</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-loss"
              aria-label="Delete rule"
              onClick={() => setDelOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete rule</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {editOpen && (
        <RuleFormDialog bookId={bookId} rule={rule} open={editOpen} onOpenChange={setEditOpen} />
      )}

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete rule</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{rule.name}&rdquo;? Its evaluation history will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
