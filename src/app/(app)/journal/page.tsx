import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getTrades } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { JournalFilters } from "@/components/journal/journal-filters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, pnlColor, formatDateTime } from "@/lib/utils";
import type { TradeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 150;

function scoreBadgeVariant(score: number): "profit" | "warning" | "loss" {
  if (score >= 80) return "profit";
  if (score >= 60) return "warning";
  return "loss";
}

function isWinner(t: TradeRecord): boolean {
  return t.exitTime !== null && t.pnl > 0;
}
function isLoser(t: TradeRecord): boolean {
  return t.exitTime !== null && t.pnl < 0;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    strategy?: string;
    symbol?: string;
    outcome?: string;
    source?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const [accounts, accountTrades] = await Promise.all([
    getAccounts(user.id),
    getTrades(user.id, sp.account ? { accountId: sp.account } : {}),
  ]);

  // Distinct option lists derived from the account-scoped set so the dropdowns
  // only offer values that actually exist for the current account.
  const symbols = [...new Set(accountTrades.map((t) => t.symbol))].sort();
  const strategies = [
    ...new Set(accountTrades.map((t) => t.strategyTag).filter((s): s is string => !!s)),
  ].sort();
  const sources = [...new Set(accountTrades.map((t) => t.source))].sort();

  // Apply the remaining filters in memory (getTrades handles accountId at the DB).
  let filtered = accountTrades;
  if (sp.symbol) filtered = filtered.filter((t) => t.symbol === sp.symbol);
  if (sp.strategy) filtered = filtered.filter((t) => t.strategyTag === sp.strategy);
  if (sp.source) filtered = filtered.filter((t) => t.source === sp.source);
  if (sp.outcome === "win") filtered = filtered.filter(isWinner);
  else if (sp.outcome === "loss") filtered = filtered.filter(isLoser);

  const total = filtered.length;
  const rows = filtered.slice(0, PAGE_SIZE);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Trade Journal"
        description="Every fill, scored against your rules. Click a row for the full breakdown."
      >
        <Badge variant="outline" className="tabular">
          {formatNumber(total)} {total === 1 ? "trade" : "trades"}
        </Badge>
      </PageHeader>

      <JournalFilters
        accounts={accounts}
        strategies={strategies}
        symbols={symbols}
        sources={sources}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No trades match these filters"
              description={
                accountTrades.length === 0
                  ? "Import a CSV or log a trade to start building your journal."
                  : "Try widening or clearing the filters above."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
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
                      <TableCell className="relative whitespace-nowrap text-muted-foreground">
                        <Link
                          href={`/journal/${t.id}`}
                          className="absolute inset-0 z-10"
                          aria-label={`Open ${t.symbol} trade`}
                        />
                        {formatDateTime(t.entryTime)}
                      </TableCell>
                      <TableCell className="font-medium">{t.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={t.side === "long" ? "profit" : "loss"}>
                          {t.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatNumber(t.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
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
                          <Badge variant={scoreBadgeVariant(score)} className="tabular">
                            {score}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.strategyTag ? (
                          <Badge variant="secondary">{t.strategyTag}</Badge>
                        ) : (
                          <span className="text-2xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {viol > 0 ? (
                          <Badge variant="loss" className="tabular">
                            {viol}
                          </Badge>
                        ) : (
                          <span className="text-2xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {total > rows.length && (
        <p className="text-center text-2xs text-muted-foreground">
          Showing latest {formatNumber(rows.length)} of {formatNumber(total)} trades. Narrow with
          filters to see more.
        </p>
      )}
    </div>
  );
}
