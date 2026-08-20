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
        <ManualEntry accounts={accounts} />
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
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [broker, setBroker] = React.useState<string>("auto");
  const [csvText, setCsvText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

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
    if (!accountId) return setError("Select a target account.");
    if (!csvText.trim()) return setError("Paste CSV text or choose a file first.");
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          csvText,
          ...(broker !== "auto" ? { broker } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setResult({
        broker: json.broker,
        imported: json.imported,
        skipped: json.skipped,
        errors: json.errors ?? [],
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
              <Label>Target account</Label>
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
                </SelectContent>
              </Select>
            </div>

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

          <div className="flex items-center gap-3">
            <Button onClick={onImport} disabled={busy} className="gap-1.5">
              <UploadCloud className="h-4 w-4" />
              {busy ? "Importing…" : "Import"}
            </Button>
            <a
              href="/samples/topstepx-sample.csv"
              download
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download sample CSV
            </a>
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
            above if detection guesses wrong.
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
