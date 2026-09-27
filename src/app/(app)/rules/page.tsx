import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ScrollText, Layers, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { effectivePlan, getFeatures, withinLimit } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import {
  getRuleBooksWithStats,
  RULE_TYPE_LABELS,
  type RuleWithStats,
} from "@/lib/rules-data";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreMeter } from "@/components/charts/score-ring";
import {
  NewRuleBookButton,
  RuleBookActiveToggle,
  RuleBookDeleteButton,
  AddRuleButton,
  RuleRowActions,
} from "@/components/rules/rule-manager";
import { cn } from "@/lib/utils";

// Score-band text color — same >=80 / 60-79 / <60 bands as the dashboard's
// ScoreRing/ScoreMeter, using the shared --score-* tokens.
function scoreText(score: number): string {
  if (score >= 80) return "text-score-high";
  if (score >= 60) return "text-score-mid";
  return "text-score-low";
}

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { books, adherence, ruleCount } = await getRuleBooksWithStats(user.id);
  const activeBooks = books.filter((b) => b.isActive).length;

  // Every plan has the rule engine; the free one is capped. Infinity means the
  // cap is off, and nothing about limits is shown at all.
  const plan = user.plan as Plan;
  const features = getFeatures(effectivePlan(plan, user.billingStatus));
  const ruleLimit = features.maxRules;
  const bookLimit = features.maxRuleBooks;
  const capped = Number.isFinite(ruleLimit);
  const atRuleLimit = !withinLimit(plan, user.billingStatus, "maxRules", ruleCount);
  const atBookLimit = !withinLimit(plan, user.billingStatus, "maxRuleBooks", books.length);
  // Someone whose trial or subscription lapsed can legitimately own MORE rules
  // than the free plan includes. Their rules keep working; we just never say
  // something nonsensical like "9 of 3 used".
  const overRuleLimit = capped && ruleCount > ruleLimit;

  const bookLimitLabel = atBookLimit
    ? `Your plan includes ${bookLimit} rulebook${bookLimit === 1 ? "" : "s"}. Upgrade to Pro for unlimited.`
    : undefined;
  const ruleLimitLabel = `All ${ruleLimit} free rules used.`;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Rule Engine"
        description="No-code rulebooks evaluated deterministically against every trade."
      >
        <NewRuleBookButton disabled={atBookLimit} limitLabel={bookLimitLabel} />
      </PageHeader>

      {/* Quiet usage line — only for a plan that actually has a cap. */}
      {capped &&
        (overRuleLimit ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your free plan includes {ruleLimit} rules — you have {ruleCount}. Your existing rules
              keep working; <UpgradeLink /> to add more.
            </span>
          </div>
        ) : atRuleLimit ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You've used all {ruleLimit} free rules. <UpgradeLink /> for unlimited rules and
              rulebooks.
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You're using {ruleCount} of {ruleLimit} free rules — Pro is unlimited. <UpgradeLink />
          </p>
        ))}

      {books.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ShieldCheck className="h-8 w-8" />}
            title="Codify your trading plan"
            description="Rulebooks turn your plan into deterministic rules that grade every trade — no black box."
            steps={[
              { label: "Create a rulebook (per strategy, account, or all trades)" },
              { label: "Add rules — time windows, risk limits, behavioral guardrails" },
              { label: "Every trade gets graded automatically into your discipline score" },
            ]}
            action={<NewRuleBookButton />}
          />
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat
              label="Overall Adherence"
              value={`${adherence}%`}
              valueClass={scoreText(adherence)}
              icon={ShieldCheck}
            />
            <SummaryStat
              label="Rulebooks"
              value={`${activeBooks}/${books.length} active`}
              icon={Layers}
            />
            <SummaryStat
              label="Rules"
              value={capped ? `${ruleCount} of ${ruleLimit}` : `${ruleCount}`}
              icon={ScrollText}
            />
          </div>

          <div className="space-y-4">
            {books.map((book) => (
              <Card key={book.id} className={cn(!book.isActive && "opacity-70")}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="truncate">{book.name}</CardTitle>
                      <Badge variant={book.isActive ? "profit" : "secondary"}>
                        {book.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
                      {scopeLabel(book.scope, book.scopeValue)}
                      {book.description ? ` · ${book.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RuleBookActiveToggle id={book.id} isActive={book.isActive} />
                    <RuleBookDeleteButton id={book.id} name={book.name} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Book adherence */}
                  <div className="rounded-lg border border-border bg-surface-raised p-3">
                    <ScoreMeter
                      label="Adherence"
                      score={book.adherence}
                      detail={`${book.passCount} pass · ${book.failCount} fail`}
                    />
                  </div>

                  {/* Rules */}
                  {book.rules.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No rules in this book yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {book.rules.map((rule) => (
                        <RuleRow key={rule.id} bookId={book.id} rule={rule} />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end pt-1">
                    <AddRuleButton
                      bookId={book.id}
                      disabled={atRuleLimit}
                      limitLabel={atRuleLimit ? ruleLimitLabel : undefined}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UpgradeLink() {
  return (
    <Link href="/settings/billing" className="font-medium underline underline-offset-2">
      Upgrade to Pro
    </Link>
  );
}

function RuleRow({ bookId, rule }: { bookId: string; rule: RuleWithStats }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5",
        !rule.isActive && "opacity-60"
      )}
    >
      <Badge variant="outline" className="shrink-0">
        {RULE_TYPE_LABELS[rule.type]}
      </Badge>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{rule.name}</p>
          {!rule.isActive && <Badge variant="secondary">Off</Badge>}
        </div>
        <p className="truncate text-2xs text-muted-foreground">{rule.summary}</p>
      </div>

      <SeverityBadge severity={rule.severity} />

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Weight</p>
        <p className="text-sm font-semibold tabular">{rule.weight}</p>
      </div>

      {/* pass/fail + mini bar */}
      <div className="w-28 shrink-0">
        <div className="flex items-baseline justify-between text-2xs">
          <span className="text-profit tabular">{rule.passCount}P</span>
          <span className="text-loss tabular">{rule.failCount}F</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              rule.adherence >= 80
                ? "bg-score-high"
                : rule.adherence >= 60
                  ? "bg-score-mid"
                  : "bg-score-low"
            )}
            style={{ width: `${rule.adherence}%` }}
          />
        </div>
      </div>

      <RuleRowActions
        bookId={bookId}
        rule={{
          id: rule.id,
          name: rule.name,
          type: rule.type,
          severity: rule.severity,
          weight: rule.weight,
          config: rule.config,
        }}
      />
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === "high" ? "loss" : severity === "medium" ? "warning" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

function scopeLabel(scope: string, scopeValue: string | null): string {
  if (scope === "strategy") return `Strategy: ${scopeValue ?? "—"}`;
  if (scope === "account") return `Account: ${scopeValue ?? "—"}`;
  return "All trades";
}

function SummaryStat({
  label,
  value,
  valueClass,
  icon: Icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className={cn("mt-2 text-2xl font-semibold tabular", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}
