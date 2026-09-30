"use client";

// The journal's trade list plus its "Load older trades" footer.
//
// The server page renders the first page (50 newest trades for the current
// filters) straight into this component. Page size by screen:
//   - Laptop (sm and up) shows all 50 and each press fetches 50 more.
//   - Phone shows the first 25 of those same rows (the phone card list simply
//     renders fewer), so there is no second request and no layout jump after
//     the page appears. A press first reveals rows already loaded, then
//     fetches 25 at a time.
// The server caps every page at 100. Changing a filter remounts this component
// (the page keys it by the filters), so paging restarts from the newest trade.

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTimeZone } from "@/components/time-zone-provider";
import { formatCurrency, formatNumber, formatDateTime, pnlColor } from "@/lib/utils";
import {
  JOURNAL_PAGE_SIZE,
  JOURNAL_PHONE_PAGE_SIZE,
  type JournalRow,
} from "@/lib/journal-rows";

/** Score-band chip classes — same bands the dashboard ring uses (>=80/60-79/<60). */
function scoreChipClass(score: number): string {
  if (score >= 80) return "bg-score-high/15 text-score-high";
  if (score >= 60) return "bg-score-mid/15 text-score-mid";
  return "bg-score-low/15 text-score-low";
}

/** Matches Tailwind's `sm` breakpoint — below it the journal shows phone cards. */
function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

function plural(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? "trade" : "trades"}`;
}

export function JournalList({
  initialRows,
  initialCursor,
  total,
  filterQuery,
}: {
  initialRows: JournalRow[];
  initialCursor: string | null;
  total: number;
  /** The current filters as a query string (address-bar keys). */
  filterQuery: string;
}) {
  const tz = useTimeZone();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [phoneShown, setPhoneShown] = useState(Math.min(JOURNAL_PHONE_PAGE_SIZE, initialRows.length));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const busy = useRef(false);

  const phoneRows = rows.slice(0, phoneShown);
  const phoneDone = cursor === null && phoneShown >= rows.length;
  const desktopDone = cursor === null;

  async function loadOlder() {
    if (busy.current) return; // double-press guard: pages never duplicate
    const phone = isPhone();
    const step = phone ? JOURNAL_PHONE_PAGE_SIZE : JOURNAL_PAGE_SIZE;

    // Phone: rows already loaded but not yet shown come first — no request.
    if (phone && phoneShown < rows.length) {
      const reveal = Math.min(step, rows.length - phoneShown);
      setPhoneShown(phoneShown + reveal);
      setAnnouncement(`${reveal} more ${reveal === 1 ? "trade" : "trades"} loaded`);
      return;
    }
    if (!cursor) return;

    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const qs = new URLSearchParams(filterQuery);
      qs.set("limit", String(step));
      qs.set("cursor", cursor);
      const res = await fetch(`/api/trades/page?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error("load failed");
      const more = json.rows as JournalRow[];
      // Belt and braces: never show the same trade twice.
      const seen = new Set(rows.map((r) => r.id));
      const fresh = more.filter((r) => !seen.has(r.id));
      const next = [...rows, ...fresh];
      setRows(next);
      setPhoneShown(next.length);
      setCursor(json.nextCursor ?? null);
      setAnnouncement(`${fresh.length} more ${fresh.length === 1 ? "trade" : "trades"} loaded`);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {/* Phone layout: stacked trade cards — one clear tap target each. */}
          <div className="sm:hidden">
            {phoneRows.map((t) => {
              const open = t.exitTime === null || t.exitPrice === null;
              const score = t.complianceScore;
              const viol = t.violationCount ?? 0;
              return (
                <Link
                  key={t.id}
                  href={`/journal/${t.id}`}
                  aria-label={`Open ${t.symbol} trade`}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-surface-raised active:bg-surface-raised"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{t.symbol}</span>
                      <span
                        className={`text-2xs font-semibold uppercase tracking-wide ${
                          t.side === "long" ? "text-profit" : "text-loss"
                        }`}
                      >
                        {t.side}
                      </span>
                      <span className={`ml-auto tabular font-medium ${pnlColor(t.pnl)}`}>
                        {open ? "—" : formatCurrency(t.pnl, { sign: true })}
                      </span>
                    </div>
                    <p className="text-xs tabular text-muted-foreground">
                      {/* Each segment is unbreakable, so a wrap only ever
                          happens at the "·" between them. */}
                      <span className="inline-block whitespace-nowrap">
                        {formatDateTime(t.entryTime, tz)}
                      </span>
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      <span className="inline-block whitespace-nowrap">
                        {formatNumber(t.quantity)} @ {formatNumber(t.entryPrice, 2)}
                        <span className="mx-1 text-muted-foreground/50">→</span>
                        {open ? (
                          <span className="text-warning">open</span>
                        ) : (
                          formatNumber(t.exitPrice as number, 2)
                        )}
                      </span>
                    </p>
                    {/* Stacked on a phone the numbers lose their column headers,
                        so each chip carries its own label. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {score == null ? (
                        <span
                          role="img"
                          aria-label="No compliance score yet"
                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold tabular text-muted-foreground"
                        >
                          —<span className="font-normal opacity-80">score</span>
                        </span>
                      ) : (
                        <span
                          role="img"
                          aria-label={`Compliance score ${score} out of 100`}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold tabular ${scoreChipClass(score)}`}
                        >
                          {score}
                          <span className="font-normal opacity-80">score</span>
                        </span>
                      )}
                      {viol > 0 && (
                        <span
                          role="img"
                          aria-label={`${viol} rule ${viol === 1 ? "violation" : "violations"}`}
                          className="inline-flex items-center gap-1 rounded bg-loss-muted px-1.5 py-0.5 text-2xs font-semibold tabular text-loss"
                        >
                          {viol}
                          <span className="font-normal opacity-80">viol.</span>
                        </span>
                      )}
                      {t.strategyTag && (
                        <Badge variant="secondary" className="normal-case tracking-normal">
                          {t.strategyTag}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                </Link>
              );
            })}
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} aria-hidden className="space-y-2 border-t border-border px-4 py-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
          </div>

          {/* sm and up: the full 10-column table. */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry → Exit</TableHead>
                  <TableHead className="text-right">Net P&amp;L</TableHead>
                  <TableHead className="text-center">Compliance</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-center">Viol.</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const open = t.exitTime === null || t.exitPrice === null;
                  const score = t.complianceScore;
                  const viol = t.violationCount ?? 0;
                  return (
                    <TableRow key={t.id} className="group relative cursor-pointer">
                      <TableCell className="whitespace-nowrap text-xs tabular text-muted-foreground">
                        <Link
                          href={`/journal/${t.id}`}
                          className="absolute inset-0 z-10"
                          aria-label={`Open ${t.symbol} trade`}
                        />
                        {formatDateTime(t.entryTime, tz)}
                      </TableCell>
                      <TableCell className="font-medium">{t.symbol}</TableCell>
                      <TableCell>
                        <span
                          className={`text-2xs font-semibold uppercase tracking-wide ${
                            t.side === "long" ? "text-profit" : "text-loss"
                          }`}
                        >
                          {t.side}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular">{formatNumber(t.quantity)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
                        {formatNumber(t.entryPrice, 2)}
                        <span className="mx-1 text-muted-foreground/50">→</span>
                        {open ? (
                          <span className="text-warning">open</span>
                        ) : (
                          formatNumber(t.exitPrice as number, 2)
                        )}
                      </TableCell>
                      <TableCell className={`text-right tabular font-medium ${pnlColor(t.pnl)}`}>
                        {open ? "—" : formatCurrency(t.pnl, { sign: true })}
                      </TableCell>
                      <TableCell className="text-center">
                        {score == null ? (
                          <span className="text-2xs text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`inline-flex min-w-[2rem] justify-center rounded px-1.5 py-0.5 text-2xs font-semibold tabular ${scoreChipClass(score)}`}
                          >
                            {score}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.strategyTag ? (
                          <Badge variant="secondary" className="normal-case tracking-normal">
                            {t.strategyTag}
                          </Badge>
                        ) : (
                          <span className="text-2xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {viol > 0 ? (
                          <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-loss-muted px-1.5 py-0.5 text-2xs font-semibold tabular text-loss">
                            {viol}
                          </span>
                        ) : (
                          <span className="text-2xs tabular text-muted-foreground/60">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ArrowRight className="h-4 w-4 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {loading && (
              <div aria-hidden className="space-y-3 border-t border-border px-4 py-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer: count, "Load older trades", end line. */}
      <div className="flex flex-col items-center space-y-2 text-center">
        {/* Phone and laptop can have different amounts on screen. */}
        <FooterState
          className="flex sm:hidden"
          done={phoneDone}
          shown={phoneShown}
          total={total}
          loading={loading}
          failed={failed}
          onLoad={loadOlder}
        />
        <FooterState
          className="hidden sm:flex"
          done={desktopDone}
          shown={rows.length}
          total={total}
          loading={loading}
          failed={failed}
          onLoad={loadOlder}
        />
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}

function FooterState({
  className,
  done,
  shown,
  total,
  loading,
  failed,
  onLoad,
}: {
  className: string;
  done: boolean;
  shown: number;
  total: number;
  loading: boolean;
  failed: boolean;
  onLoad: () => void;
}) {
  if (done) {
    return (
      <p className={`${className} w-full flex-col items-center text-2xs text-muted-foreground`}>
        You&apos;ve reached your first trade.
      </p>
    );
  }
  return (
    <div className={`${className} w-full flex-col items-center gap-2`}>
      <p className="text-2xs tabular text-muted-foreground">
        Showing {formatNumber(shown)} of {plural(total)}
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={onLoad}
        disabled={loading}
        aria-busy={loading}
        className="h-11 w-full max-w-xs gap-2 sm:w-auto"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading older trades…
          </>
        ) : failed ? (
          "Try again"
        ) : (
          "Load older trades"
        )}
      </Button>
      {failed && !loading && (
        <p role="alert" className="text-xs text-loss">
          Couldn&apos;t load more trades. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
