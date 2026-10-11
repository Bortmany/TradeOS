"use client";

// SizeCheck — "What should my size have been?", a collapsed section for the
// trade page. Pre-filled from the trade (its symbol, its account's starting
// balance, 1% risk); the trader types the stop they used. A what-if only:
// nothing is saved and nothing is sent anywhere. It uses the same maths and the
// same SizeWorking as /size, so the two can never disagree.
//
// Mount it inside the Journal card of the trade editor:
//   <SizeCheck symbol={trade.symbol} startingBalance={account.startingBalance}
//              accountCurrency={account.currency} tradedQuantity={trade.quantity}
//              isOpen={trade.exitTime === null} />

import { useEffect, useId, useRef, useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/hint";
import { SizeWorking } from "@/components/sizing/size-working";
import { calculatePositionSize, formatSize, sizeMarket } from "@/lib/sizing";
import { parseNumberText, withCommas } from "@/lib/sizing/parse";
import { cn } from "@/lib/utils";

export interface SizeCheckProps {
  /** The trade's own symbol, e.g. "MES" or "MESZ6" or "EURUSD". */
  symbol: string;
  /** The account's starting balance; null or 0 leaves the box blank for the trader. */
  startingBalance: number | null;
  /** The account's currency (default USD). Forex sizing is USD accounts only. */
  accountCurrency?: string;
  /** What the trade actually traded (contracts or lots). null when unknown. */
  tradedQuantity: number | null;
  /** True while the trade has no exit yet. */
  isOpen?: boolean;
}

export function SizeCheck({
  symbol: tradeSymbol,
  startingBalance,
  accountCurrency = "USD",
  tradedQuantity,
  isOpen = false,
}: SizeCheckProps) {
  const panelId = useId();
  const stopRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(tradeSymbol.toUpperCase());
  const [accountSize, setAccountSize] = useState(
    startingBalance && startingBalance > 0 ? withCommas(String(startingBalance)) : ""
  );
  const [risk, setRisk] = useState("1");
  const [stop, setStop] = useState("");
  const [dollarsPerPoint, setDollarsPerPoint] = useState("");

  // The stop is the first thing to type, so it gets the focus when the panel opens.
  useEffect(() => {
    if (open) stopRef.current?.focus();
  }, [open]);

  const recognised = sizeMarket(tradeSymbol) !== "unknown";
  const market = sizeMarket(symbol);
  const stopUnit = market === "futures" ? "points" : market === "forex" ? "pips" : "points";

  const p = {
    size: parseNumberText(accountSize),
    risk: parseNumberText(risk),
    stop: parseNumberText(stop),
    dpp: parseNumberText(dollarsPerPoint),
  };
  const needsDpp = !recognised && market === "unknown";

  let content: React.ReactNode;
  if (p.stop.kind === "empty") {
    content = <p className="text-sm text-muted-foreground">Type your stop distance to see the size.</p>;
  } else if (p.stop.kind !== "ok" || p.size.kind !== "ok" || p.risk.kind !== "ok") {
    content = (
      <p className="text-xs text-loss">
        {p.size.kind === "empty" ? "Type your account size to see the size." : "That doesn't look like a number."}
      </p>
    );
  } else {
    const r = calculatePositionSize({
      symbol,
      accountSize: p.size.value,
      riskPercent: p.risk.value,
      stopDistance: p.stop.value,
      accountCurrency,
      ...(needsDpp && p.dpp.kind === "ok" ? { dollarsPerPoint: p.dpp.value } : {}),
    });
    if (!r.ok) {
      content = <p className="text-xs text-loss">{r.message}</p>;
    } else {
      const riskText = `${trimNumber(p.risk.value)}%`;
      const traded = tradedQuantity;
      const showTraded = !isOpen && traded !== null && traded > 0;
      const over = showTraded ? Math.max(0, roundTo(traded! - r.size, r.market)) : 0;
      content = (
        <div className="space-y-3">
          <div className="space-y-0.5">
            <p className="text-base font-semibold">
              {showTraded ? (
                <>
                  You traded {formatTraded(traded!, r.market)}.{" "}
                  <span className={over > 0 ? "text-warning" : undefined}>
                    Your {riskText} size was {formatSize(r, r.size)}.
                  </span>
                </>
              ) : (
                <>
                  {isOpen ? "You're still in this trade. " : ""}
                  Your {riskText} size {isOpen ? "is" : "was"} {formatSize(r, r.size)}.
                </>
              )}
            </p>
            {over > 0 && (
              <p className="text-xs text-muted-foreground">
                That&apos;s {formatSize(r, over)} more than your {riskText} size.
              </p>
            )}
            {r.tooBigForOne && (
              <p className="text-xs text-muted-foreground">
                Even the smallest size risks more than your limit here.
              </p>
            )}
          </div>
          <SizeWorking result={r} compact />
        </div>
      );
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 text-start transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Size check</span>
          <span className="block text-2xs text-muted-foreground">What should my size have been?</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <div id={panelId} hidden={!open} className="space-y-3 pt-1">
        {open && (
          <>
            {recognised ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Symbol
                <Hint label="Taken from this trade">
                  <Badge variant="secondary" tabIndex={0} className="cursor-help normal-case">
                    {tradeSymbol.toUpperCase()}
                  </Badge>
                </Hint>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={`${panelId}-sym`} className="text-sm font-medium">
                  Symbol
                </Label>
                <Input
                  id={`${panelId}-sym`}
                  value={symbol}
                  maxLength={32}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="MES"
                  className="text-base sm:text-sm"
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
                {market === "unknown" && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-loss">
                      We don&apos;t know the symbol {symbol.replace(/[^\x20-\x7e]/g, "").slice(0, 24) || "that symbol"}.
                      Pick one of the chips, or type the dollars per point below.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["MES", "ES", "MNQ", "NQ", "EURUSD"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSymbol(c)}
                          className="h-11 rounded-full border border-border bg-surface-raised px-4 text-sm transition-colors hover:border-primary/40 active:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <Label htmlFor={`${panelId}-dpp`} className="text-sm font-medium">
                      Dollars per point
                    </Label>
                    <Input
                      id={`${panelId}-dpp`}
                      value={dollarsPerPoint}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="e.g. 5.00"
                      maxLength={20}
                      className="text-base sm:text-sm"
                      onChange={(e) => setDollarsPerPoint(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${panelId}-size`} className="text-sm font-medium">
                Account size
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id={`${panelId}-size`}
                  value={accountSize}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="50,000"
                  maxLength={20}
                  className="ps-7 text-base tabular sm:text-sm"
                  onChange={(e) => setAccountSize(withCommas(e.target.value))}
                />
              </div>
              {accountSize === "" && (
                <p className="text-2xs text-muted-foreground">This account has no starting balance. Type one.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Hint label="The most you're willing to lose on this trade, as a share of your account.">
                  <Label htmlFor={`${panelId}-risk`} className="text-sm font-medium">
                    Risk per trade
                  </Label>
                </Hint>
                <div className="relative">
                  <Input
                    id={`${panelId}-risk`}
                    value={risk}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="1"
                    maxLength={10}
                    className="pe-8 text-base tabular sm:text-sm"
                    onChange={(e) => setRisk(e.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Hint label="How far your stop is from your entry. Points for futures, pips for forex.">
                  <Label htmlFor={`${panelId}-stop`} className="text-sm font-medium">
                    Stop distance
                  </Label>
                </Hint>
                <div className="relative">
                  <Input
                    id={`${panelId}-stop`}
                    ref={stopRef}
                    value={stop}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={market === "forex" ? "20" : "8"}
                    maxLength={20}
                    className="pe-14 text-base tabular sm:text-sm"
                    onChange={(e) => setStop(e.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
                    {stopUnit}
                  </span>
                </div>
              </div>
            </div>

            <div aria-live="polite">{content}</div>

            <p className="text-2xs text-muted-foreground">
              A what-if only. Nothing here is saved, and nothing is sent to your broker.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function trimNumber(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

function roundTo(n: number, market: "futures" | "forex"): number {
  return market === "futures" ? Math.round(n) : Math.round(n * 100) / 100;
}

function formatTraded(n: number, market: "futures" | "forex"): string {
  return market === "futures" ? String(Math.round(n * 100) / 100) : n.toFixed(2);
}
