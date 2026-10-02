"use client";

// Open positions: what is open right now on each linked account (symbol, side,
// size, average price, last price, open P&L). Watch-only. There is NO close,
// flatten or reduce control anywhere and the rows are not tappable: you manage a
// position in your trading platform. A contract TradeOS has no point value for
// shows "Not calculated" and is left out of the totals (never guessed).

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Info, WifiOff } from "lucide-react";
import { cn, formatCurrency, pnlColor } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone-provider";
import { Hint } from "@/components/hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLive } from "@/components/live/live-provider";
import { ESTIMATED_HINT } from "@/components/live/live-alerts";
import { formatAsAt, price } from "@/lib/live/format";
import type { PositionViewJson } from "@/lib/alerts/view";

export const WATCH_ONLY_LINE = "TradeOS only watches positions. To close one, use your trading platform.";
export const NOT_PRICED_HINT =
  "TradeOS doesn't have a dollar value per point for this contract, so it doesn't guess. It is left out of your open-loss totals.";
export const NO_PRICE_HINT =
  "TradeOS couldn't find a recent price for this contract, so its open P&L is left out of your totals.";

export function EstimatedBadge() {
  return (
    <Hint label={ESTIMATED_HINT}>
      <span
        tabIndex={0}
        className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Badge variant="outline" className="h-4 text-2xs">
          Estimated
        </Badge>
      </span>
    </Hint>
  );
}

function pnlCell(p: PositionViewJson) {
  if (p.openPnl == null) {
    return (
      <Hint label={p.notPricedReason === "no_price" ? NO_PRICE_HINT : NOT_PRICED_HINT}>
        <span
          tabIndex={0}
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Not calculated <Info className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Hint>
    );
  }
  return (
    <span className={cn("text-base font-semibold tabular", pnlColor(p.openPnl))}>
      {formatCurrency(p.openPnl)}
    </span>
  );
}

function lastText(p: PositionViewJson): string {
  if (p.lastPrice == null) return "no price";
  return p.priceSource === "bar" ? `last (1-min) ${price(p.lastPrice)}` : `last ${price(p.lastPrice)}`;
}

function total(positions: PositionViewJson[]): number {
  return Math.round(positions.reduce((s, p) => s + (p.openPnl ?? 0), 0) * 100) / 100;
}

/** The compact, non-tappable list (dashboard on phones, inside each Prop card). */
export function PositionRows({
  positions,
  showFooter = false,
}: {
  positions: PositionViewJson[];
  showFooter?: boolean;
}) {
  const unpriced = positions.filter((p) => p.openPnl == null).length;
  const estimated = positions.some((p) => p.priceSource === "bar" && p.openPnl != null);
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {positions.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {p.symbol} {p.side} {p.size}
              </p>
              {pnlCell(p)}
            </div>
            <p className="text-2xs tabular text-muted-foreground">
              avg {price(p.avgPrice)} · {lastText(p)}
            </p>
          </li>
        ))}
      </ul>
      {positions.length >= 2 && (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Open P&amp;L total {estimated && <EstimatedBadge />}
          </p>
          <span className={cn("text-base font-semibold tabular", pnlColor(total(positions)))}>
            {formatCurrency(total(positions))}
          </span>
        </div>
      )}
      {unpriced > 0 && (
        <p className="text-xs text-warning">
          {unpriced} position{unpriced === 1 ? " isn't" : "s aren't"} priced, so totals leave{" "}
          {unpriced === 1 ? "it" : "them"} out.
        </p>
      )}
      {showFooter && <p className="text-2xs text-muted-foreground">{WATCH_ONLY_LINE}</p>}
    </div>
  );
}

/** The dashboard card. Shown only when something is open, or the last list is stale. */
export function OpenPositionsCard() {
  const { snap } = useLive();
  const tz = useTimeZone();
  const positions = snap.positions;
  const accounts = snap.accounts;

  const unreachable = accounts.filter((a) => a.nearLive && a.health === "stale");
  const rejected = accounts.filter((a) => a.nearLive && a.health === "rejected");
  const neverRead = accounts.filter(
    (a) => a.nearLive && a.health === "waiting" && a.lastError
  );
  if (positions.length === 0 && unreachable.length === 0 && rejected.length === 0 && neverRead.length === 0) {
    return null;
  }

  const asAt = positions.map((p) => p.readAt).sort()[0] ?? null;
  const estimated = positions.some((p) => p.priceSource === "bar" && p.openPnl != null);
  const stale = unreachable.length > 0 || rejected.length > 0;
  const groups = groupByAccount(positions);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Open positions</CardTitle>
          {positions.length > 0 && <Badge variant="outline">{positions.length}</Badge>}
        </div>
        {positions.length > 0 && (
          <div className="flex items-center gap-2">
            {estimated && <EstimatedBadge />}
            {asAt && (
              <span className={cn("text-2xs tabular", stale ? "text-warning" : "text-muted-foreground")}>
                As at {formatAsAt(asAt, tz)}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rejected.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              TopstepX rejected your key, so this list stopped updating
              {asAt ? ` at ${formatAsAt(asAt, tz)}` : ""}.{" "}
              <Link href="/import" className="text-primary underline underline-offset-2">
                Reconnect
              </Link>
            </span>
          </p>
        )}
        {rejected.length === 0 && unreachable.length > 0 && asAt && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Can&apos;t reach TopstepX. This is the list as at {formatAsAt(asAt, tz)} and may be out of
              date.
            </span>
          </p>
        )}
        {positions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t read your open positions yet. We&apos;ll keep trying about once a minute.
          </p>
        )}

        {groups.map(([accountId, list]) => (
          <div key={accountId} className="space-y-2">
            {groups.length > 1 && (
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                {list[0].accountName}
              </p>
            )}
            {/* Phone: compact non-tappable rows. Laptop: a real table. */}
            <div className="md:hidden">
              <PositionRows positions={list} />
            </div>
            <div className="hidden md:block">
              <PositionTable positions={list} />
            </div>
          </div>
        ))}
        {positions.length > 0 && <p className="text-2xs text-muted-foreground">{WATCH_ONLY_LINE}</p>}
      </CardContent>
    </Card>
  );
}

function groupByAccount(positions: PositionViewJson[]): [string, PositionViewJson[]][] {
  const map = new Map<string, PositionViewJson[]>();
  for (const p of positions) {
    const list = map.get(p.accountId) ?? [];
    list.push(p);
    map.set(p.accountId, list);
  }
  return [...map.entries()];
}

function PositionTable({ positions }: { positions: PositionViewJson[] }) {
  const unpriced = positions.filter((p) => p.openPnl == null).length;
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            {["Account", "Symbol", "Side", "Size", "Avg price", "Last price"].map((h) => (
              <TableHead key={h} className="text-2xs uppercase tracking-wide">
                {h}
              </TableHead>
            ))}
            <TableHead className="text-right text-2xs uppercase tracking-wide">Open P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => (
            <TableRow key={p.id} className="hover:bg-transparent">
              <TableCell>{p.accountName}</TableCell>
              <TableCell className="font-medium">{p.symbol}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.side === "long" ? "Long" : "Short"}</Badge>
              </TableCell>
              <TableCell className="tabular">{p.size}</TableCell>
              <TableCell className="tabular">{price(p.avgPrice)}</TableCell>
              <TableCell className="tabular">
                {p.lastPrice == null ? "—" : price(p.lastPrice)}
                {p.priceSource === "bar" && p.lastPrice != null && (
                  <span className="ms-1 text-2xs text-muted-foreground">(1-min)</span>
                )}
              </TableCell>
              <TableCell className="text-right">{pnlCell(p)}</TableCell>
            </TableRow>
          ))}
          {positions.length >= 2 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="text-sm text-muted-foreground">
                Open P&amp;L total
              </TableCell>
              <TableCell className="text-right">
                <span className={cn("text-base font-semibold tabular", pnlColor(total(positions)))}>
                  {formatCurrency(total(positions))}
                </span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {unpriced > 0 && (
        <p className="flex items-center gap-1 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {unpriced} position{unpriced === 1 ? " isn't" : "s aren't"} priced, so totals leave{" "}
          {unpriced === 1 ? "it" : "them"} out.
        </p>
      )}
    </div>
  );
}
