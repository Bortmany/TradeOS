import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardCheck, NotebookPen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { buildReport } from "@/lib/reports";
import {
  getWeeklyReview,
  listWeeklyReviews,
  normalizeWeekKey,
  shiftWeekKey,
  weekEndKey,
  weekKeyOf,
} from "@/lib/reviews";
import { PageHeader } from "@/components/page-header";
import { WeeklyReviewForm } from "@/components/reports/weekly-review-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateTime,
  pnlColor,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function weekLabel(weekKey: string): string {
  return `${formatDate(`${weekKey}T12:00:00`)} – ${formatDate(`${weekEndKey(weekKey)}T12:00:00`)}`;
}

export default async function WeeklyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { week } = await searchParams;

  const weekKey = normalizeWeekKey(week);
  const thisWeekKey = weekKeyOf(new Date());
  const isCurrentWeek = weekKey === thisWeekKey;
  const prevKey = shiftWeekKey(weekKey, -1);
  const nextKey = shiftWeekKey(weekKey, 1);

  // The numbers are read-only: exactly what the Reports page computes for the
  // trailing week, never re-derived here.
  const [report, saved, history] = await Promise.all([
    isCurrentWeek ? buildReport(user.id, "week") : null,
    getWeeklyReview(user.id, weekKey),
    listWeeklyReviews(user.id),
  ]);

  const m = report?.metrics;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Weekly Review"
        description="Ten quiet minutes on the week you just traded — the numbers first, then three questions."
      >
        <Button asChild variant="outline">
          <Link href="/reports">Back to reports</Link>
        </Button>
      </PageHeader>

      {/* Week picker */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={`/reports/review?week=${prevKey}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Previous week
          </Link>
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-medium">{weekLabel(weekKey)}</p>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            {isCurrentWeek ? "This week" : "Past week"}
          </p>
        </div>
        {isCurrentWeek ? (
          <span className="w-[7.5rem] shrink-0" />
        ) : (
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={`/reports/review?week=${nextKey}`}>
              Next week <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {/* The week in numbers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>The week in numbers</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {report
                ? `Your last 7 days: ${formatDate(report.from)} – ${formatDate(report.to)}.`
                : "Live numbers only cover the last 7 days, so this past week shows your written answers only."}
            </p>
          </div>
          {report && (
            <Badge variant={report.metrics.netPnl >= 0 ? "profit" : "loss"} className="tabular">
              {formatCurrency(report.metrics.netPnl, { sign: true })}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!report ? (
            <p className="py-4 text-sm text-muted-foreground">
              Open this week&apos;s review to see the numbers alongside the questions.
            </p>
          ) : report.tradeCount === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="No trades in the last 7 days"
              description="Nothing to grade yet — you can still write down what you want to change."
              className="py-6"
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <Stat
                  label="Net P&L"
                  value={formatCurrency(m!.netPnl, { sign: true })}
                  accent={m!.netPnl >= 0 ? "profit" : "loss"}
                  hint={`${report.tradeCount} trades`}
                />
                <Stat
                  label="Win Rate"
                  value={formatPercent(m!.winRate)}
                  hint={`${m!.winCount}W / ${m!.lossCount}L`}
                />
                <Stat
                  label="Rule Adherence"
                  value={`${report.compliance.adherencePct.toFixed(0)}%`}
                  hint="Checks passed"
                />
                <Stat
                  label="Rules Broken"
                  value={String(report.compliance.totalFails)}
                  accent={report.compliance.totalFails === 0 ? "profit" : "loss"}
                  hint={report.compliance.totalFails === 0 ? "Clean week" : "Across the week"}
                />
              </div>

              {report.compliance.topViolations.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-4">
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Rules you broke most
                  </p>
                  {report.compliance.topViolations.slice(0, 3).map((v) => (
                    <div
                      key={v.ruleName}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm"
                    >
                      <span className="truncate">{v.ruleName}</span>
                      <Badge variant="loss" className="shrink-0 tabular">
                        {v.count} {v.count === 1 ? "time" : "times"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {report.worst.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Worst trade of the week
                  </p>
                  <p className="text-sm">
                    {report.worst[0].symbol}{" "}
                    <span className={`font-semibold tabular ${pnlColor(report.worst[0].pnl)}`}>
                      {formatCurrency(report.worst[0].pnl, { sign: true })}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      on {formatDate(report.worst[0].entryTime)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The three prompts */}
      <Card>
        <CardHeader>
          <CardTitle>Three questions</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Short answers are fine. Saved against the week of {weekLabel(weekKey)}.
          </p>
        </CardHeader>
        <CardContent>
          <WeeklyReviewForm
            weekStart={weekKey}
            worked={saved?.answers.worked ?? ""}
            costliestRule={saved?.answers.costliestRule ?? ""}
            oneChange={saved?.answers.oneChange ?? ""}
            savedAt={saved ? formatDateTime(saved.updatedAt) : null}
          />
        </CardContent>
      </Card>

      {/* Earlier reviews */}
      <Card>
        <CardHeader>
          <CardTitle>Earlier reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="h-6 w-6" />}
              title="No reviews saved yet"
              description="Answer the three questions above and this week becomes the first entry."
              className="py-6"
            />
          ) : (
            history.map((r) => (
              <Link
                key={r.weekKey}
                href={`/reports/review?week=${r.weekKey}`}
                className="block rounded-lg border border-border bg-surface-raised px-3 py-2.5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{weekLabel(r.weekKey)}</p>
                  {r.weekKey === weekKey && (
                    <Badge variant="outline" className="shrink-0">
                      Viewing
                    </Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-2xs text-muted-foreground">
                  {r.answers.oneChange || r.answers.worked || r.answers.costliestRule || "—"}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
