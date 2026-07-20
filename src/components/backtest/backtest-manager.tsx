"use client";

// TradeOS — Testing Portal interactive layer.
// Small client components the (server) /backtest pages drop in:
//   • NewReplayDialog      — run a what-if test over recorded trades
//   • NewSimulationDialog  — run a strategy simulation over a candle dataset
//   • NewDatasetDialog     — upload an OHLC candle CSV as a MarketDataset
//   • DatasetDeleteButton  — delete a dataset (runs keep their results)
//   • RunRowActions        — rename / edit notes / delete a recorded run
// All call the JSON APIs then router.refresh() to re-render server data; a
// successful test navigates straight to its result page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Pencil, Play, Trash2, Upload } from "lucide-react";
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
  SESSION_KEYS,
  SIM_STRATEGIES,
  type SessionKey,
  type SimStrategy,
} from "@/lib/types";
import { SESSION_LABELS, SIM_STRATEGY_LABELS, WEEKDAY_SHORT } from "@/lib/backtest/labels";

// --------------------------------------------------------------------------
// shared helpers
// --------------------------------------------------------------------------

async function mutate(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Request failed." };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss">
      {message}
    </p>
  );
}

function CheckRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-surface accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

// --------------------------------------------------------------------------
// New replay test
// --------------------------------------------------------------------------

export interface ReplayOptions {
  accounts: { id: string; name: string }[];
  ruleBooks: { id: string; name: string }[];
  strategyTags: string[];
}

export function NewReplayDialog({ options }: { options: ReplayOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [tags, setTags] = useState<string[]>([]);
  const [symbols, setSymbols] = useState("");
  const [sessions, setSessions] = useState<SessionKey[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [side, setSide] = useState("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ruleBookId, setRuleBookId] = useState("none");

  function reset() {
    setName("");
    setAccountId("all");
    setTags([]);
    setSymbols("");
    setSessions([]);
    setWeekdays([]);
    setSide("any");
    setFrom("");
    setTo("");
    setRuleBookId("none");
    setError(null);
  }

  function toggle<T>(list: T[], value: T, on: boolean): T[] {
    return on ? [...list, value] : list.filter((v) => v !== value);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const symbolList = symbols
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    const res = await mutate("/api/backtests", "POST", {
      kind: "replay",
      name,
      ...(accountId !== "all" ? { accountId } : {}),
      ...(tags.length > 0 ? { strategyTags: tags } : {}),
      ...(symbolList.length > 0 ? { symbols: symbolList } : {}),
      ...(sessions.length > 0 ? { sessions } : {}),
      ...(weekdays.length > 0 ? { weekdays } : {}),
      ...(side !== "any" ? { side } : {}),
      // Plain dates — the server interprets them as ET calendar days
      // (from = ET midnight, to = ET end-of-day, inclusive).
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(ruleBookId !== "none" ? { ruleBookId } : {}),
    });
    setLoading(false);
    if (!res.ok || !res.id) return setError(res.error ?? "Failed.");
    setOpen(false);
    reset();
    router.push(`/backtest/${res.id}`);
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
        <Play className="h-4 w-4" /> Replay test
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New replay test</DialogTitle>
          <DialogDescription>
            Re-run your recorded history with filters: which trades would this strategy
            have kept, and how would it have performed vs. what you actually did?
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bt-name">Test name</Label>
            <Input
              id="bt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ORB mornings only"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {options.accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Side</Label>
              <Select value={side} onValueChange={setSide}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Long & short</SelectItem>
                  <SelectItem value="long">Long only</SelectItem>
                  <SelectItem value="short">Short only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {options.strategyTags.length > 0 && (
            <div className="space-y-1.5">
              <Label>Strategies (leave empty for all)</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface-raised p-3">
                {options.strategyTags.map((tag) => (
                  <CheckRow
                    key={tag}
                    label={tag}
                    checked={tags.includes(tag)}
                    onChange={(on) => setTags(toggle(tags, tag, on))}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Sessions (leave empty for all)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface-raised p-3">
              {SESSION_KEYS.map((key) => (
                <CheckRow
                  key={key}
                  label={SESSION_LABELS[key]}
                  checked={sessions.includes(key)}
                  onChange={(on) => setSessions(toggle(sessions, key, on))}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Weekdays (leave empty for all)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface-raised p-3">
              {[1, 2, 3, 4, 5].map((day) => (
                <CheckRow
                  key={day}
                  label={WEEKDAY_SHORT[day]}
                  checked={weekdays.includes(day)}
                  onChange={(on) => setWeekdays(toggle(weekdays, day, on))}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bt-symbols">Symbols (comma-separated)</Label>
              <Input
                id="bt-symbols"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="ES, NQ"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rulebook filter</Label>
              <Select value={ruleBookId} onValueChange={setRuleBookId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {options.ruleBooks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      Skip trades that broke: {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bt-from">From</Label>
              <Input id="bt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt-to">To</Label>
              <Input id="bt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {error && <FormError message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Run test
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// New simulation
// --------------------------------------------------------------------------

export interface DatasetOption {
  id: string;
  name: string;
  symbol: string;
}

export function NewSimulationDialog({ datasets }: { datasets: DatasetOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [strategy, setStrategy] = useState<SimStrategy>("opening_range_breakout");
  const [direction, setDirection] = useState("both");
  const [contracts, setContracts] = useState("1");
  const [stopPoints, setStopPoints] = useState("");
  const [targetPoints, setTargetPoints] = useState("");
  const [rangeMinutes, setRangeMinutes] = useState("15");
  const [fastPeriod, setFastPeriod] = useState("9");
  const [slowPeriod, setSlowPeriod] = useState("21");
  const [maType, setMaType] = useState("sma");
  const [levelSide, setLevelSide] = useState("both");
  const [flattenAt, setFlattenAt] = useState("15:55");
  const [feesPerSide, setFeesPerSide] = useState("2.25");
  const [slippageTicks, setSlippageTicks] = useState("0");
  const [tickSize, setTickSize] = useState("0.25");

  function reset() {
    setName("");
    setDatasetId(datasets[0]?.id ?? "");
    setStrategy("opening_range_breakout");
    setDirection("both");
    setContracts("1");
    setStopPoints("");
    setTargetPoints("");
    setRangeMinutes("15");
    setFastPeriod("9");
    setSlowPeriod("21");
    setMaType("sma");
    setLevelSide("both");
    setFlattenAt("15:55");
    setFeesPerSide("2.25");
    setSlippageTicks("0");
    setTickSize("0.25");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await mutate("/api/backtests", "POST", {
      kind: "simulation",
      name,
      datasetId,
      strategy,
      direction,
      contracts,
      ...(stopPoints !== "" ? { stopPoints } : {}),
      ...(targetPoints !== "" ? { targetPoints } : {}),
      rangeMinutes,
      fastPeriod,
      slowPeriod,
      maType,
      levelSide,
      flattenAt,
      feesPerSide,
      slippageTicks,
      tickSize,
    });
    setLoading(false);
    if (!res.ok || !res.id) return setError(res.error ?? "Failed.");
    setOpen(false);
    reset();
    router.push(`/backtest/${res.id}`);
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
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <FlaskConical className="h-4 w-4" /> Simulation
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New simulation</DialogTitle>
          <DialogDescription>
            Run a no-code strategy over an uploaded candle dataset with deterministic,
            conservative fills.
          </DialogDescription>
        </DialogHeader>

        {datasets.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted-foreground">
            Upload a market dataset first — a candle CSV export (TradingView, NinjaTrader)
            with time, open, high, low and close columns.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sim-name">Test name</Label>
              <Input
                id="sim-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="ORB 15m on ES"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dataset</Label>
                <Select value={datasetId} onValueChange={setDatasetId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        {ds.name} ({ds.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Strategy</Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as SimStrategy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIM_STRATEGIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SIM_STRATEGY_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {strategy === "opening_range_breakout" && (
              <div className="space-y-1.5">
                <Label htmlFor="sim-range">Opening range (minutes after 09:30 ET)</Label>
                <Input
                  id="sim-range"
                  type="number"
                  min={1}
                  max={180}
                  required
                  value={rangeMinutes}
                  onChange={(e) => setRangeMinutes(e.target.value)}
                />
              </div>
            )}

            {strategy === "ma_cross" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sim-fast">Fast period</Label>
                  <Input
                    id="sim-fast"
                    type="number"
                    min={2}
                    required
                    value={fastPeriod}
                    onChange={(e) => setFastPeriod(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sim-slow">Slow period</Label>
                  <Input
                    id="sim-slow"
                    type="number"
                    min={3}
                    required
                    value={slowPeriod}
                    onChange={(e) => setSlowPeriod(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>MA type</Label>
                  <Select value={maType} onValueChange={setMaType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sma">SMA</SelectItem>
                      <SelectItem value="ema">EMA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {strategy === "prev_day_level" && (
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select value={levelSide} onValueChange={setLevelSide}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Prev-day high & low</SelectItem>
                    <SelectItem value="high">Prev-day high only</SelectItem>
                    <SelectItem value="low">Prev-day low only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={direction} onValueChange={setDirection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Long & short</SelectItem>
                    <SelectItem value="long">Long only</SelectItem>
                    <SelectItem value="short">Short only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-contracts">Contracts</Label>
                <Input
                  id="sim-contracts"
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={contracts}
                  onChange={(e) => setContracts(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-stop">Stop (points, optional)</Label>
                <Input
                  id="sim-stop"
                  type="number"
                  min={0}
                  step="0.25"
                  value={stopPoints}
                  onChange={(e) => setStopPoints(e.target.value)}
                  placeholder="e.g. 8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-target">Target (points, optional)</Label>
                <Input
                  id="sim-target"
                  type="number"
                  min={0}
                  step="0.25"
                  value={targetPoints}
                  onChange={(e) => setTargetPoints(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-flatten">Flatten at (ET)</Label>
                <Input
                  id="sim-flatten"
                  value={flattenAt}
                  onChange={(e) => setFlattenAt(e.target.value)}
                  placeholder="15:55"
                  pattern="\d{1,2}:\d{2}"
                  title="ET time as H:MM or HH:MM, e.g. 15:55"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-fees">Fees per side ($)</Label>
                <Input
                  id="sim-fees"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={feesPerSide}
                  onChange={(e) => setFeesPerSide(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-slip">Slippage (ticks)</Label>
                <Input
                  id="sim-slip"
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={slippageTicks}
                  onChange={(e) => setSlippageTicks(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-tick">Tick size</Label>
                <Input
                  id="sim-tick"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={tickSize}
                  onChange={(e) => setTickSize(e.target.value)}
                />
              </div>
            </div>

            {error && <FormError message={error} />}
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Run simulation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Dataset upload / delete
// --------------------------------------------------------------------------

export function NewDatasetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");

  function reset() {
    setName("");
    setSymbol("");
    setTimeframe("5m");
    setFileName(null);
    setCsvText("");
    setError(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
    if (!name) setName(file.name.replace(/\.csv$/i, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText) return setError("Choose a CSV file first.");
    setLoading(true);
    setError(null);
    const res = await mutate("/api/backtests/datasets", "POST", {
      name,
      symbol,
      timeframe,
      csvText,
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Upload data
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload market data</DialogTitle>
          <DialogDescription>
            A candle CSV export (TradingView, NinjaTrader) with time, open, high, low and
            close columns. Up to 25,000 candles per dataset.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ds-file">CSV file</Label>
            <Input id="ds-file" type="file" accept=".csv,text/csv" onChange={onFile} />
            {fileName && <p className="text-2xs text-muted-foreground">{fileName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input
              id="ds-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ES 5-minute, June"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ds-symbol">Symbol</Label>
              <Input
                id="ds-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
                placeholder="ES"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-tf">Bar size</Label>
              <Input
                id="ds-tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="5m"
              />
            </div>
          </div>
          {error && <FormError message={error} />}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DatasetDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setError(null);
    const res = await mutate("/api/backtests/datasets", "DELETE", { id });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Failed.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-loss"
        aria-label="Delete dataset"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete dataset</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{name}&rdquo;? Recorded test results are kept — only the candle
            data is removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <FormError message={error} />}
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
// Run row actions (rename / notes, delete)
// --------------------------------------------------------------------------

export function RunRowActions({
  id,
  name,
  notes,
  redirectTo,
}: {
  id: string;
  name: string;
  notes: string | null;
  // Where to navigate after a successful delete — set on the run's own detail
  // page, where refreshing in place would land on a 404.
  redirectTo?: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newName, setNewName] = useState(name);
  const [newNotes, setNewNotes] = useState(notes ?? "");

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await mutate(`/api/backtests/${id}`, "PATCH", {
      name: newName,
      notes: newNotes || null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Failed.");
    setEditOpen(false);
    router.refresh();
  }

  async function confirmDelete() {
    setLoading(true);
    setDeleteError(null);
    const res = await mutate(`/api/backtests/${id}`, "DELETE", {});
    setLoading(false);
    if (!res.ok) return setDeleteError(res.error ?? "Failed.");
    setDeleteOpen(false);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setNewName(name);
            setNewNotes(notes ?? "");
            setError(null);
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Edit test"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit test</DialogTitle>
            <DialogDescription>Rename this test or update its notes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`run-name-${id}`}>Name</Label>
              <Input
                id={`run-name-${id}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`run-notes-${id}`}>Notes</Label>
              <Textarea
                id={`run-notes-${id}`}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="What did this test tell you?"
                className="min-h-[80px]"
              />
            </div>
            {error && <FormError message={error} />}
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDeleteError(null);
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-loss"
          aria-label="Delete test"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete test</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{name}&rdquo; and its recorded results? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <FormError message={deleteError} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={loading}>
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
