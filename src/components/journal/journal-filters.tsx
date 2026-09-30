"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  SlidersHorizontal,
  Wallet,
  Tag,
  LineChart,
  Trophy,
  Radio,
  X,
  CalendarDays,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDayFilterLabel, isDayKey } from "@/lib/et-days";

interface AccountOption {
  id: string;
  name: string;
  kind: string;
}

const ALL = "all";

const OUTCOME_LABELS: Record<string, string> = { win: "Winners", loss: "Losers" };

/** "csv" → "CSV", "manual" → "Manual" (sources are stored lower-case). */
function sourceLabel(s: string): string {
  return s === "csv" || s === "api" ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * URL-driven journal filter bar. Each control writes/clears a search param
 * (`account`, `symbol`, `strategy`, `outcome`, `source`, `from`, `to`). Any
 * change reloads the list from the newest trade (the list is keyed by the
 * filters). Triggers read what they filter ("Symbol") and, once picked, what
 * they're set to ("Symbol: MES").
 */
export function JournalFilters({
  accounts,
  strategies,
  symbols,
  sources,
}: {
  accounts: AccountOption[];
  strategies: string[];
  symbols: string[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pushParams(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    pushParams(next);
  }

  function setDates(from: string, to: string) {
    const next = new URLSearchParams(params.toString());
    if (from) next.set("from", from);
    else next.delete("from");
    if (to) next.set("to", to);
    else next.delete("to");
    pushParams(next);
  }

  const account = params.get("account") ?? ALL;
  const strategy = params.get("strategy") ?? ALL;
  const symbol = params.get("symbol") ?? ALL;
  const outcome = params.get("outcome") ?? ALL;
  const source = params.get("source") ?? ALL;
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = isDayKey(fromParam) ? fromParam : "";
  const to = isDayKey(toParam) ? toParam : "";

  const hasFilters =
    account !== ALL ||
    strategy !== ALL ||
    symbol !== ALL ||
    outcome !== ALL ||
    source !== ALL ||
    !!from ||
    !!to;

  const accountName = accounts.find((a) => a.id === account)?.name;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span className="flex items-center gap-1.5 pl-1 pr-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </span>

      <FilterSelect
        value={account}
        onChange={(v) => setParam("account", v)}
        icon={<Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        name="Account"
        picked={account !== ALL ? accountName ?? "Unknown" : null}
        anyLabel="All accounts"
        width="w-[160px]"
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
      />

      <FilterSelect
        value={symbol}
        onChange={(v) => setParam("symbol", v)}
        icon={<LineChart className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        name="Symbol"
        picked={symbol !== ALL ? symbol : null}
        anyLabel="Any symbol"
        width="w-[124px]"
        options={symbols.map((s) => ({ value: s, label: s }))}
      />

      <FilterSelect
        value={strategy}
        onChange={(v) => setParam("strategy", v)}
        icon={<Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        name="Strategy"
        picked={strategy !== ALL ? strategy : null}
        anyLabel="Any strategy"
        width="w-[148px]"
        options={strategies.map((s) => ({ value: s, label: s }))}
      />

      <FilterSelect
        value={outcome}
        onChange={(v) => setParam("outcome", v)}
        icon={<Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        name="Outcome"
        picked={outcome !== ALL ? OUTCOME_LABELS[outcome] ?? outcome : null}
        anyLabel="Any outcome"
        width="w-[124px]"
        options={[
          { value: "win", label: "Winners" },
          { value: "loss", label: "Losers" },
        ]}
      />

      <FilterSelect
        value={source}
        onChange={(v) => setParam("source", v)}
        icon={<Radio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        name="Source"
        picked={source !== ALL ? sourceLabel(source) : null}
        anyLabel="Any source"
        width="w-[124px]"
        options={sources.map((s) => ({ value: s, label: sourceLabel(s) }))}
      />

      <DateFilter from={from} to={to} onApply={setDates} />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="h-10 text-xs text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

const TRIGGER = "h-10 gap-2 border-border bg-surface text-xs";
const TRIGGER_PICKED = "border-primary/40 bg-primary/10 text-foreground";

function FilterSelect({
  value,
  onChange,
  icon,
  name,
  picked,
  anyLabel,
  width,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  name: string;
  /** The picked value's label, or null when this filter is off. */
  picked: string | null;
  anyLabel: string;
  width: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={picked ? `${name}: ${picked}` : `${name} filter`}
        className={cn(TRIGGER, picked ? `min-w-[124px] max-w-[160px] ${TRIGGER_PICKED}` : width)}
      >
        {icon}
        {/* The trigger names the filter and, once picked, its value. */}
        <SelectValue>
          <span className="block truncate">{picked ? `${name}: ${picked}` : name}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Dates (ET)" — a From/To pair of New York calendar days. The list keeps
 * trades whose New York day falls inside the range (the same day boundary the
 * rule engine and Reports use).
 */
function DateFilter({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const backwards = !!draftFrom && !!draftTo && draftTo < draftFrom;
  const label = formatDayFilterLabel(from, to);

  function onOpenChange(next: boolean) {
    if (next) {
      // Start each visit from what's applied now.
      setDraftFrom(from);
      setDraftTo(to);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label={label ? `Date filter, New York days: ${label}` : "Date filter, New York days"}
                className={cn(TRIGGER, "min-w-[124px] justify-start font-normal sm:w-[168px]", label && TRIGGER_PICKED)}
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{label ?? "Dates (ET)"}</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="hidden sm:block">Filter by New York calendar day</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" className="w-72 space-y-3 p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (backwards) return;
            onApply(draftFrom, draftTo);
            setOpen(false);
          }}
        >
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            New York calendar days (ET)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="journal-from">From</Label>
              <Input
                id="journal-from"
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="journal-to">To</Label>
              <Input
                id="journal-to"
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                aria-invalid={backwards}
                aria-describedby={backwards ? "journal-date-error" : undefined}
                className={cn("h-10 text-xs", backwards && "border-loss")}
              />
            </div>
          </div>
          {backwards && (
            <p id="journal-date-error" role="alert" className="text-xs text-loss">
              The end date is before the start date.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftFrom("");
                setDraftTo("");
                onApply("", "");
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={backwards}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
