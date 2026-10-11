import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getTradesPage, getJournalFilterOptions } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { JournalFilters } from "@/components/journal/journal-filters";
import { JournalList } from "@/components/journal/journal-list";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils";
import {
  JOURNAL_PAGE_SIZE,
  parseJournalFilters,
  journalFilterQuery,
  toJournalRow,
  type JournalFilterKey,
} from "@/lib/journal-rows";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Record<JournalFilterKey, string>>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filter = parseJournalFilters(await searchParams);
  const filterQuery = journalFilterQuery(filter);

  // Everything is filtered, counted and paged in the database. This renders
  // the first page only; "Load older trades" fetches the rest from
  // /api/trades/page. Times in the list print in the trader's zone (the list
  // reads it from the TimeZoneProvider the app layout sets up).
  const [accounts, options, page] = await Promise.all([
    getAccounts(user.id),
    getJournalFilterOptions(user.id, filter.accountId),
    getTradesPage(user.id, { filter, limit: JOURNAL_PAGE_SIZE }),
  ]);
  const total = page.total;
  // No symbols at all means the account (or the whole journal) has no trades,
  // so the "journal is empty" steps apply rather than "no trades match".
  const noTradesAtAll = options.symbols.length === 0;

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
        strategies={options.strategies}
        symbols={options.symbols}
        sources={options.sources}
      />

      {page.rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            {noTradesAtAll ? (
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="Your journal is empty"
                description="Three steps and every trade you take gets graded against your own rules."
                steps={[
                  { label: "Import trades from your broker CSV" },
                  { label: "Define your rulebook in the Rule Engine" },
                  { label: "See a 0–100 discipline score on every trade" },
                ]}
                action={
                  <div className="flex flex-col items-center gap-3 sm:flex-row">
                    <Button asChild>
                      <Link href="/import">Import your trades</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href="/rules">Open the Rulebook</Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="No trades match these filters"
                description="Try widening or clearing the filters above."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        // Keyed by the filters: any filter change starts again from the newest.
        <JournalList
          key={filterQuery}
          initialRows={page.rows.map(toJournalRow)}
          initialCursor={page.nextCursor}
          total={total}
          filterQuery={filterQuery}
        />
      )}
    </div>
  );
}
