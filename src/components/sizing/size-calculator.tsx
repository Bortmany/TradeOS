"use client";

// SizeCalculator — the /size page body. Type four things, see how many
// contracts or lots fit your risk, with the working shown. Updates live: no
// Calculate button. Pure arithmetic: nothing is sent to your broker or saved on
// the server (the last account size and risk % stay on this device only).

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hint } from "@/components/hint";
import { SizeWorking } from "@/components/sizing/size-working";
import {
  calculatePositionSize,
  formatSize,
  sizeLabel,
  sizeMarket,
  sizeSummaryLine,
  type SizeOk,
} from "@/lib/sizing";
import { parseNumberText, withCommas } from "@/lib/sizing/parse";
import { cn, formatCurrency } from "@/lib/utils";

export interface SizeAccount {
  id: string;
  name: string;
  startingBalance: number;
  currency: string;
}

const STORAGE_KEY = "tradeos.size.v1";
const CHIPS = ["MES", "ES", "MNQ", "NQ", "EURUSD"] as const;
const OTHER = "Other futures";

type Field = "account" | "symbol" | "accountSize" | "riskPercent" | "stopDistance" | "dollarsPerPoint";

export function SizeCalculator({
  accounts,
  accountsFailed = false,
}: {
  accounts: SizeAccount[];
  accountsFailed?: boolean;
}) {
  const [accountId, setAccountId] = useState("own");
  const [symbol, setSymbol] = useState("");
  const [otherChip, setOtherChip] = useState(false);
  const [dollarsPerPoint, setDollarsPerPoint] = useState("");
  const [accountSize, setAccountSize] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");
  const [stop, setStop] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [focused, setFocused] = useState(false);
  const [announce, setAnnounce] = useState("");
  const restored = useRef(false);

  // Restore the last account size and risk % (this device only). The symbol and
  // the stop are deliberately not remembered: a stale stop is how wrong sizes
  // get traded.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { accountSize?: unknown; riskPercent?: unknown };
        if (typeof saved.accountSize === "string" && saved.accountSize.length <= 20) {
          setAccountSize(withCommas(saved.accountSize));
        }
        if (typeof saved.riskPercent === "string" && saved.riskPercent.length <= 10) {
          setRiskPercent(saved.riskPercent);
        }
      }
    } catch {
      /* storage blocked: the page still works */
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accountSize, riskPercent }));
    } catch {
      /* ignore */
    }
  }, [accountSize, riskPercent]);

  const market = sizeMarket(symbol);
  const needsDpp = otherChip && market === "unknown";
  const stopUnit = market === "futures" ? "points" : market === "forex" ? "pips" : null;
  const account = accounts.find((a) => a.id === accountId) ?? null;

  const parsed = {
    accountSize: parseNumberText(accountSize),
    riskPercent: parseNumberText(riskPercent),
    stopDistance: parseNumberText(stop),
    dollarsPerPoint: parseNumberText(dollarsPerPoint),
  };

  const outcome = useMemo(() => {
    const p = {
      accountSize: parseNumberText(accountSize),
      riskPercent: parseNumberText(riskPercent),
      stopDistance: parseNumberText(stop),
      dollarsPerPoint: parseNumberText(dollarsPerPoint),
    };
    // Nothing to work out until every box has something in it.
    const symbolBlank = symbol.trim() === "" && !otherChip;
    const blank =
      symbolBlank ||
      p.accountSize.kind === "empty" ||
      p.riskPercent.kind === "empty" ||
      p.stopDistance.kind === "empty" ||
      (needsDpp && p.dollarsPerPoint.kind === "empty");
    if (blank) return { state: "incomplete" as const };
    if (
      p.accountSize.kind !== "ok" ||
      p.riskPercent.kind !== "ok" ||
      p.stopDistance.kind !== "ok" ||
      (needsDpp && p.dollarsPerPoint.kind !== "ok")
    ) {
      return { state: "error" as const, field: null, message: null };
    }
    const r = calculatePositionSize({
      symbol,
      accountSize: p.accountSize.value,
      riskPercent: p.riskPercent.value,
      stopDistance: p.stopDistance.value,
      accountCurrency: account?.currency ?? "USD",
      ...(needsDpp && p.dollarsPerPoint.kind === "ok" ? { dollarsPerPoint: p.dollarsPerPoint.value } : {}),
    });
    return r.ok ? { state: "ok" as const, result: r } : { state: "error" as const, field: r.field, message: r.message };
  }, [symbol, otherChip, needsDpp, accountSize, riskPercent, stop, dollarsPerPoint, account]);

  const result: SizeOk | null = outcome.state === "ok" ? outcome.result : null;

  // Screen readers hear the answer, no more than about once every half second.
  useEffect(() => {
    const text = result ? `Your size: ${sizeLabel(result)}.` : "";
    const t = setTimeout(() => setAnnounce(text), 500);
    return () => clearTimeout(t);
  }, [result]);

  // Field errors: shown for a field once it has been left or holds something invalid.
  function textError(field: "accountSize" | "riskPercent" | "stopDistance" | "dollarsPerPoint"): string | null {
    const p = parsed[field];
    if (p.kind === "nan") return "That doesn't look like a number.";
    if (p.kind === "empty") {
      if (!touched[field]) return null;
      return field === "dollarsPerPoint"
        ? "Enter the dollars per point for this contract, for example 5."
        : "That doesn't look like a number.";
    }
    // Dollars per point: zero or negative gets the calculator's own message.
    if (field === "dollarsPerPoint") return p.value <= 0 ? "Enter the dollars per point for this contract, for example 5." : null;
    if (p.value <= 0 && field !== "stopDistance") return "Enter a number above zero.";
    if (p.value < 0) return "Enter a number above zero.";
    return null;
  }

  function fieldError(field: Field): string | null {
    const own =
      field === "accountSize" || field === "riskPercent" || field === "stopDistance" || field === "dollarsPerPoint"
        ? textError(field)
        : null;
    if (own && (field !== "dollarsPerPoint" || needsDpp)) return own;
    if (outcome.state === "error" && outcome.field === field && outcome.message) {
      // Symbol errors only once something has been typed or the box was left.
      if (field === "symbol" && symbol.trim() === "" && !touched.symbol) return null;
      return outcome.message;
    }
    return null;
  }

  function touch(field: Field) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }

  function pickAccount(id: string) {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a && a.startingBalance > 0) setAccountSize(withCommas(String(a.startingBalance)));
  }

  function chooseSymbol(s: string) {
    setOtherChip(false);
    setSymbol(s);
    touch("symbol");
  }

  function tryExample(example: "mes" | "eur") {
    setAccountId("own");
    setOtherChip(false);
    setRiskPercent("1");
    if (example === "mes") {
      setSymbol("MES");
      setAccountSize("50,000");
      setStop("8");
    } else {
      setSymbol("EURUSD");
      setAccountSize("10,000");
      setStop("20");
    }
  }

  const riskBig = parsed.riskPercent.kind === "ok" && parsed.riskPercent.value > 5;
  const isEmpty = outcome.state === "incomplete" && !accountSize && !stop && !symbol && !otherChip;

  const symbolErr = fieldError("symbol");
  const accountErr = fieldError("account");
  const sizeErr = fieldError("accountSize");
  const riskErr = fieldError("riskPercent");
  const stopErr = fieldError("stopDistance");
  const dppErr = fieldError("dollarsPerPoint");

  const unitWord = result ? sizeLabel(result).replace(/^\S+\s/, "") : "";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Answer + working. On a laptop they sit together on the right and stay
          in view while you type; on a phone the answer comes first, then the
          inputs, then the working (the wrapper disappears so each can be ordered). */}
      <div className="max-lg:contents lg:sticky lg:top-20 lg:col-span-3 lg:col-start-3 lg:row-start-1 lg:space-y-6 lg:self-start">
        <Card
          className={cn(
            "sticky top-14 z-10 max-lg:order-1 lg:static",
            // While typing on a phone the card shrinks to one row.
            focused && result && "max-lg:hidden"
          )}
        >
          <CardContent className="space-y-1 p-4 sm:p-6">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Your size</p>
            {isEmpty ? (
              <>
                <p className="text-3xl font-semibold tabular text-foreground">—</p>
                <p className="text-sm text-muted-foreground">
                  Fill in the four boxes and your size appears here. Sizing by hunch is how good days go bad, so
                  let&apos;s do it properly.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => tryExample("mes")}
                    className="min-h-11 rounded-full border border-border bg-surface-raised px-4 text-sm transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Try MES, $50k, 1%, 8 points
                  </button>
                  <button
                    type="button"
                    onClick={() => tryExample("eur")}
                    className="min-h-11 rounded-full border border-border bg-surface-raised px-4 text-sm transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Try EURUSD, $10k, 1%, 20 pips
                  </button>
                </div>
              </>
            ) : result ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-3xl font-semibold tabular",
                      result.tooBigForOne ? "text-warning" : "text-foreground"
                    )}
                  >
                    {formatSize(result, result.size)}
                  </span>
                  <span className="text-base text-muted-foreground">{unitWord}</span>
                </p>
                <p className="text-sm tabular text-muted-foreground">{sizeSummaryLine(result)}</p>
                {result.tooBigForOne && (
                  <p className="text-sm text-muted-foreground">
                    Try a smaller stop, a bigger account or a higher risk %.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular text-foreground">—</p>
                <p className="text-sm text-muted-foreground">
                  {outcome.state === "error"
                    ? "Fix the red line below and your size appears here."
                    : "Fill in the four boxes and your size appears here."}
                </p>
              </>
            )}
            <p className="pt-1 text-2xs text-muted-foreground">Fees and slippage are not included.</p>
          </CardContent>
        </Card>

        {/* Phone, keyboard open: one 56px row with the answer. */}
        {focused && result && (
          <div className="sticky top-14 z-10 flex h-14 items-center rounded-lg border border-border bg-card px-4 text-sm tabular shadow-sm max-lg:order-1 lg:hidden">
            <span className="font-semibold">{sizeLabel(result)}</span>
            <span className="px-2 text-muted-foreground">·</span>
            <span className="truncate text-muted-foreground">
              {result.tooBigForOne
                ? `even 1 ${result.unit} risks ${formatCurrency(result.smallestRisk)}`
                : `risking ${formatCurrency(result.realRisk)} (${result.realRiskPercent.toFixed(2)}%)`}
            </span>
          </div>
        )}

        <div aria-live="polite" className="sr-only">
          {announce}
        </div>

        <Card className="max-lg:order-3">
          <CardHeader>
            <CardTitle>The working</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SizeWorking result={result} />
            <p className="px-3 text-2xs text-muted-foreground">
              This page only does arithmetic. It never places an order or talks to your broker.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card
        className="max-lg:order-2 lg:col-span-2 lg:col-start-1 lg:row-start-1"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <CardHeader>
          <CardTitle>Your numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {accountsFailed ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your accounts. Type your account size instead.
            </p>
          ) : accounts.length > 0 ? (
            <div className="space-y-1.5">
              <Hint label="Pick an account to start from its starting balance.">
                <Label htmlFor="size-account" className="text-sm font-medium">
                  Account
                </Label>
              </Hint>
              <Select value={accountId} onValueChange={pickAccount}>
                <SelectTrigger id="size-account" className="h-11 text-base sm:h-10 sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Type my own size</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.currency !== "USD" ? ` (${a.currency})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountErr && <p className="text-xs text-loss">{accountErr}</p>}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="size-symbol" className="text-sm font-medium">
              Symbol
            </Label>
            <Input
              id="size-symbol"
              value={symbol}
              placeholder="MES"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              aria-invalid={symbolErr ? true : undefined}
              className={cn("text-base sm:h-10 sm:text-sm", symbolErr && "border-loss")}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onBlur={() => touch("symbol")}
            />
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Common symbols">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={!otherChip && symbol === c}
                  onClick={() => chooseSymbol(c)}
                  className={cn(
                    "h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9",
                    !otherChip && symbol === c
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-surface-raised hover:border-primary/40 active:bg-surface-overlay"
                  )}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={otherChip}
                onClick={() => {
                  setOtherChip(true);
                  setSymbol("");
                }}
                className={cn(
                  "h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9",
                  otherChip
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-surface-raised hover:border-primary/40 active:bg-surface-overlay"
                )}
              >
                {OTHER}
              </button>
            </div>
            {symbolErr ? (
              <p className="text-xs text-loss">{symbolErr}</p>
            ) : (
              <p className="text-2xs text-muted-foreground">Futures like MES, or a forex pair like EURUSD.</p>
            )}
          </div>

          {needsDpp && (
            <div className="space-y-1.5">
              <Label htmlFor="size-dpp" className="text-sm font-medium">
                Dollars per point
              </Label>
              <UnitInput
                id="size-dpp"
                value={dollarsPerPoint}
                placeholder="e.g. 5.00"
                unit="$ per point"
                invalid={!!dppErr}
                onChange={(v) => setDollarsPerPoint(v)}
                onBlur={() => touch("dollarsPerPoint")}
              />
              {dppErr && <p className="text-xs text-loss">{dppErr}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="size-account-size" className="text-sm font-medium">
              Account size
            </Label>
            <UnitInput
              id="size-account-size"
              value={accountSize}
              placeholder="50,000"
              prefix="$"
              invalid={!!sizeErr}
              onChange={(v) => {
                setAccountSize(withCommas(v));
                if (accountId !== "own") setAccountId("own");
              }}
              onBlur={() => touch("accountSize")}
            />
            {sizeErr && <p className="text-xs text-loss">{sizeErr}</p>}
          </div>

          <div className="space-y-1.5">
            <Hint label="The most you're willing to lose on this trade, as a share of your account.">
              <Label htmlFor="size-risk" className="text-sm font-medium">
                Risk per trade
              </Label>
            </Hint>
            <UnitInput
              id="size-risk"
              value={riskPercent}
              placeholder="1"
              unit="%"
              invalid={!!riskErr}
              onChange={(v) => setRiskPercent(v)}
              onBlur={() => touch("riskPercent")}
            />
            {riskErr ? (
              <p className="text-xs text-loss">{riskErr}</p>
            ) : riskBig ? (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                That&apos;s a big bite for one trade. The answer is still shown, but double-check the percentage.
              </p>
            ) : (
              <p className="text-2xs text-muted-foreground">
                The most you&apos;re willing to lose on this trade, as a share of your account.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Hint label="How far your stop is from your entry. Points for futures, pips for forex.">
              <Label htmlFor="size-stop" className="text-sm font-medium">
                {stopUnit ? `Stop distance (${stopUnit})` : "Stop distance"}
              </Label>
            </Hint>
            <UnitInput
              id="size-stop"
              value={stop}
              placeholder={market === "forex" ? "20" : "8"}
              unit={stopUnit ?? undefined}
              invalid={!!stopErr}
              onChange={(v) => setStop(v)}
              onBlur={() => touch("stopDistance")}
            />
            {stopErr ? (
              <p className="text-xs text-loss">{stopErr}</p>
            ) : (
              <p className="text-2xs text-muted-foreground">
                {market === "forex"
                  ? "How far your stop is from your entry, in pips (1 pip is 0.0001 on most pairs, 0.01 on JPY pairs)."
                  : "How far your stop is from your entry."}
              </p>
            )}
          </div>

          <p className="text-2xs text-muted-foreground">Your last numbers are remembered on this device only.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** A number box with the unit inside it at the reading end (or a $ at the start). */
function UnitInput({
  id,
  value,
  placeholder,
  unit,
  prefix,
  invalid,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  placeholder: string;
  unit?: string;
  prefix?: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 start-3 flex select-none items-center text-sm text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={20}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "text-base tabular sm:h-10 sm:text-sm",
          prefix && "ps-7",
          unit && "pe-20",
          invalid && "border-loss"
        )}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex select-none items-center text-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}
