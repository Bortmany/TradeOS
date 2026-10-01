"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { SIDES, EMOTIONS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NEW_ACCOUNT = "__new__";

interface AccountOption {
  id: string;
  name: string;
  kind: string;
}
interface BrokerOption {
  key: string;
  label: string;
}

interface ImportResult {
  broker: string;
  imported: number;
  skipped: number;
  errors: string[];
  // MT5 files only: how the times were read, and how many open positions were left out.
  timesReadAs?: string;
  openSkipped?: number;
}

type ServerTimeMode = "ny_close" | "utc" | "offset";

const OFFSET_MESSAGE = "Enter a whole number of hours between -12 and +14.";

// Whole hours only, -12 to +14 ("+2", "-5", "3"). Anything else is null.
function parseOffsetHours(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n >= -12 && n <= 14 ? n : null;
}

// Shared honest-status panels — errors are never buried in plain text.
function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss-muted px-3 py-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
      <p className="text-sm text-loss">{message}</p>
    </div>
  );
}

function SuccessPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-profit/30 bg-profit-muted px-3 py-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
      <p className="text-sm text-profit">{message}</p>
    </div>
  );
}

export function ImportWizard({
  accounts,
  brokers,
}: {
  accounts: AccountOption[];
  brokers: BrokerOption[];
}) {
  return (
    <Tabs defaultValue="csv" className="space-y-4">
      <TabsList>
        <TabsTrigger value="csv">CSV Import</TabsTrigger>
        <TabsTrigger value="manual">Manual Entry</TabsTrigger>
      </TabsList>

      <TabsContent value="csv">
        <CsvImport accounts={accounts} brokers={brokers} />
      </TabsContent>

      <TabsContent value="manual">
        {accounts.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground">
            Logging a trade by hand needs a trading account. Import a CSV first (the account is
            created for you), or{" "}
            <a href="/accounts" className="text-primary hover:underline">
              add one under Accounts
            </a>
            .
          </p>
        ) : (
          <ManualEntry accounts={accounts} />
        )}
      </TabsContent>
    </Tabs>
  );
}

// --------------------------------------------------------------------------
// CSV Import
// --------------------------------------------------------------------------

function CsvImport({
  accounts,
  brokers,
}: {
  accounts: AccountOption[];
  brokers: BrokerOption[];
}) {
  const router = useRouter();
  // "Import into": an existing account, or NEW (type a name and starting balance and
  // the account is created as part of the import, no detour through Accounts).
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? NEW_ACCOUNT);
  const [newName, setNewName] = React.useState("");
  const [newBalance, setNewBalance] = React.useState("");
  const creatingAccount = accountId === NEW_ACCOUNT;
  const [broker, setBroker] = React.useState<string>("auto");
  const [csvText, setCsvText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  // Which clock an MT5 file's times use. Only shown (and sent) for MT5 / Auto-detect.
  const [serverMode, setServerMode] = React.useState<ServerTimeMode>("ny_close");
  const [offsetText, setOffsetText] = React.useState("");
  const [offsetTouched, setOffsetTouched] = React.useState(false);
  const showServerTime = broker === "auto" || broker === "mt5";
  const offsetHours = parseOffsetHours(offsetText);
  const offsetInvalid = serverMode === "offset" && offsetHours === null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
  }

  async function onImport() {
    setError(null);
    setResult(null);
    if (creatingAccount && !newName.trim()) return setError("Give the new account a name.");
    if (creatingAccount && newBalance.trim() && !(Number(newBalance) >= 0)) {
      return setError("Starting balance must be a number, 0 or more.");
    }
    if (!csvText.trim()) return setError("Paste CSV text or choose a file first.");
    if (showServerTime && offsetInvalid) {
      setOffsetTouched(true);
      return setError(OFFSET_MESSAGE);
    }
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(creatingAccount
            ? {
                newAccount: {
                  name: newName.trim(),
                  startingBalance: newBalance.trim() ? Number(newBalance) : 0,
                },
              }
            : { accountId }),
          csvText,
          ...(broker !== "auto" ? { broker } : {}),
          ...(showServerTime
            ? {
                serverTime:
                  serverMode === "offset"
                    ? { mode: "offset", hours: offsetHours }
                    : { mode: serverMode },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      // The account made during this import is now a real one: keep it selected.
      if (creatingAccount && json.accountId) {
        setAccountId(json.accountId);
        setNewName("");
        setNewBalance("");
      }
      setResult({
        broker: json.broker,
        imported: json.imported,
        skipped: json.skipped,
        errors: json.errors ?? [],
        timesReadAs: json.timesReadAs,
        openSkipped: json.openSkipped,
      });
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Upload a broker CSV</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your file is read in your browser. Nothing leaves this device until you press
            Import, and we never ask for your broker password.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Import into</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_ACCOUNT}>Create a new account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {creatingAccount && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="new-account-name">New account name</Label>
                  <Input
                    id="new-account-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Topstep 50K"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-account-balance">Starting balance</Label>
                  <Input
                    id="new-account-balance"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Broker format</Label>
              <Select value={broker} onValueChange={setBroker}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  {brokers.map((b) => (
                    <SelectItem key={b.key} value={b.key}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showServerTime && (
              <>
                <div className="space-y-1.5">
                  <Label>Broker server time</Label>
                  <Select
                    value={serverMode}
                    onValueChange={(v) => setServerMode(v as ServerTimeMode)}
                  >
                    <SelectTrigger title="Which clock the times in your MT5 file use">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ny_close">
                        Most brokers (GMT+2 winter / GMT+3 summer, New York close)
                      </SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                      <SelectItem value="offset">Fixed offset</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {serverMode === "offset" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="mt5-offset">Hours from UTC</Label>
                    <Input
                      id="mt5-offset"
                      type="number"
                      inputMode="decimal"
                      step={1}
                      min={-12}
                      max={14}
                      value={offsetText}
                      onChange={(e) => setOffsetText(e.target.value)}
                      onBlur={() => setOffsetTouched(true)}
                      placeholder="+2"
                      aria-invalid={offsetTouched && offsetInvalid}
                      className={cn(
                        offsetTouched && offsetInvalid && "border-loss focus-visible:ring-loss"
                      )}
                    />
                    {offsetTouched && offsetInvalid && (
                      <p className="text-2xs text-loss">{OFFSET_MESSAGE}</p>
                    )}
                  </div>
                )}

                <p className="text-2xs text-muted-foreground sm:col-span-2">
                  MetaTrader shows your broker&apos;s clock, not yours. Only used for MT5 files.
                  Not sure? Compare the Market Watch clock in MT5 with UTC.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <label
              htmlFor="csv-file"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-surface-raised px-4 py-4 transition-colors hover:border-primary/50"
            >
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {fileName ?? "Choose a .csv file"}
                </p>
                <p className="text-2xs text-muted-foreground">
                  Read locally — nothing uploads until you press Import.
                </p>
              </div>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                className="hidden"
              />
            </label>
            {showServerTime && (
              <p className="text-2xs text-muted-foreground">
                MT5 export: Toolbox, then History. Choose Positions, right-click, Report, save,
                open in Excel, then Save as CSV (comma delimited).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-text">…or paste CSV</Label>
            <Textarea
              id="csv-text"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setFileName(null);
              }}
              placeholder="Symbol,Side,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Fees,PnL"
              rows={6}
              className="font-mono text-xs"
            />
          </div>

          {error && <ErrorPanel message={error} />}

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button onClick={onImport} disabled={busy} className="w-full gap-1.5 sm:w-auto">
              <UploadCloud className="h-4 w-4" />
              {busy ? "Importing…" : "Import"}
            </Button>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a
                href="/samples/topstepx-sample.csv"
                download
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download sample CSV
              </a>
              <a
                href="/samples/mt5-sample.csv"
                download
                title="A small example MetaTrader 5 Positions file to try"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download MT5 sample
              </a>
            </div>
          </div>

          {result && (
            <div
              className={cn(
                "rounded-lg border bg-surface-raised p-4",
                result.errors.length > 0 ? "border-warning/40" : "border-border"
              )}
            >
              <div className="flex items-center gap-2">
                {result.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-warning" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-profit" />
                )}
                <p className="text-sm font-medium">
                  {result.errors.length > 0
                    ? "Imported with warnings"
                    : "Import complete"}
                </p>
                <Badge variant="info" className="ml-auto">
                  {result.broker}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Imported
                  </p>
                  <p
                    className={cn(
                      "tabular text-lg font-semibold",
                      result.imported > 0 ? "text-profit" : "text-muted-foreground"
                    )}
                  >
                    {result.imported}
                  </p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Skipped
                  </p>
                  <p className="tabular text-lg font-semibold text-muted-foreground">
                    {result.skipped}
                  </p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Warnings
                  </p>
                  <p
                    className={cn(
                      "tabular text-lg font-semibold",
                      result.errors.length > 0 ? "text-warning" : "text-muted-foreground"
                    )}
                  >
                    {result.errors.length}
                  </p>
                </div>
              </div>
              {(result.timesReadAs || (result.openSkipped ?? 0) > 0) && (
                <div className="mt-3 space-y-1 text-sm">
                  {result.timesReadAs && <p>Times were read as {result.timesReadAs}.</p>}
                  {(result.openSkipped ?? 0) > 0 && (
                    <p>
                      {result.openSkipped === 1
                        ? "1 open position was skipped — import again after it closes."
                        : `${result.openSkipped} open positions were skipped — import again after they close.`}
                    </p>
                  )}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  <p className="text-2xs uppercase tracking-wide text-warning">
                    Rows that need attention
                  </p>
                  {result.errors.map((err, i) => (
                    <p
                      key={i}
                      className="rounded-md bg-warning-muted px-2.5 py-1.5 text-2xs text-foreground"
                    >
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supported brokers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Auto-detect inspects your CSV headers and picks the right parser. Override it
            above if detection guesses wrong. MetaTrader 5 needs the Positions table, not
            Deals.
          </p>
          <ul className="space-y-1.5 pt-1">
            {brokers.map((b) => (
              <li key={b.key} className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {b.label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Manual Entry
// --------------------------------------------------------------------------

function ManualEntry({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const empty = {
    accountId: accounts[0]?.id ?? "",
    symbol: "",
    side: "long",
    quantity: "",
    entryPrice: "",
    exitPrice: "",
    entryTime: "",
    exitTime: "",
    fees: "0",
    strategyTag: "",
    emotions: "",
    notes: "",
    whyEntered: "",
  };
  const [form, setForm] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  // One idempotency key per "open form" — so a rapid double-submit (or a network
  // retry) of the SAME trade lands as one row, not several. The API dedupes on
  // this key; we mint a fresh one after each successful save so the next, genuinely
  // different trade isn't mistaken for a duplicate.
  const idempotencyKey = React.useRef<string>(crypto.randomUUID());

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDone(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          symbol: form.symbol,
          side: form.side,
          quantity: form.quantity,
          entryPrice: form.entryPrice,
          exitPrice: form.exitPrice || null,
          entryTime: form.entryTime,
          exitTime: form.exitTime || null,
          fees: form.fees || 0,
          strategyTag: form.strategyTag || null,
          emotions: form.emotions || null,
          notes: form.notes || null,
          whyEntered: form.whyEntered || null,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save trade.");
        return;
      }
      // Saved: start a fresh dedupe key so the next trade is treated as new.
      idempotencyKey.current = crypto.randomUUID();
      setForm({ ...empty, accountId: form.accountId });
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a trade</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-why">Why I entered</Label>
            <p className="text-xs text-muted-foreground">
              One or two lines: what did you see, and what was your plan? (optional)
            </p>
            <Textarea
              id="m-why"
              value={form.whyEntered}
              onChange={(e) => set("whyEntered", e.target.value.slice(0, 2000))}
              placeholder="e.g. Broke above the opening range on rising volume. Plan: stop under the range low, target 2R."
              maxLength={2000}
              className="min-h-[72px]"
            />
            <p
              className={cn(
                "text-end text-2xs tabular",
                form.whyEntered.length >= 1800 ? "text-warning" : "text-muted-foreground"
              )}
            >
              {form.whyEntered.length.toLocaleString("en-US")} / 2,000
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={(v) => set("accountId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-symbol">Symbol</Label>
              <Input
                id="m-symbol"
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder="ES"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Side</Label>
              <Select value={form.side} onValueChange={(v) => set("side", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIDES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-qty">Quantity</Label>
              <Input
                id="m-qty"
                type="number"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="1"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-entry">Entry price</Label>
              <Input
                id="m-entry"
                type="number"
                inputMode="decimal"
                value={form.entryPrice}
                onChange={(e) => set("entryPrice", e.target.value)}
                placeholder="5000.00"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-exit">Exit price</Label>
              <Input
                id="m-exit"
                type="number"
                inputMode="decimal"
                value={form.exitPrice}
                onChange={(e) => set("exitPrice", e.target.value)}
                placeholder="Leave blank if open"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-entrytime">Entry time</Label>
              <Input
                id="m-entrytime"
                type="datetime-local"
                value={form.entryTime}
                onChange={(e) => set("entryTime", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-exittime">Exit time</Label>
              <Input
                id="m-exittime"
                type="datetime-local"
                value={form.exitTime}
                onChange={(e) => set("exitTime", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-fees">Fees</Label>
              <Input
                id="m-fees"
                type="number"
                inputMode="decimal"
                value={form.fees}
                onChange={(e) => set("fees", e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-strategy">Strategy tag</Label>
              <Input
                id="m-strategy"
                value={form.strategyTag}
                onChange={(e) => set("strategyTag", e.target.value)}
                placeholder="vwap_reclaim"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Emotion</Label>
              <Select value={form.emotions} onValueChange={(v) => set("emotions", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map((em) => (
                    <SelectItem key={em} value={em} className="capitalize">
                      {em}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-notes">Notes</Label>
            <Textarea
              id="m-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="What was the setup? How did you manage it?"
              rows={3}
            />
          </div>

          {error && <ErrorPanel message={error} />}
          {done && <SuccessPanel message="Trade saved. Log another below." />}

          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save trade"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
