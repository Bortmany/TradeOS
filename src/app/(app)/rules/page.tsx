import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Lock, ScrollText, Layers } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import {
  getRuleBooksWithStats,
  RULE_TYPE_LABELS,
  type RuleWithStats,
} from "@/lib/rules-data";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreMeter } from "@/components/charts/score-ring";
import {
  NewRuleBookButton,
  RuleBookActiveToggle,
  RuleBookDeleteButton,
  AddRuleButton,
  RuleRowActions,
} from "@/components/rules/rule-manager";
import { cn, scoreColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const gated = !hasFeature(user.plan as Plan, user.billingStatus, "ruleEngine");
  if (gated) {
    return (
      <div className="container max-w-7xl py-6">
        <PageHeader title="Rule Engine" description="No-code discipline rules for every trade." />
        <div className="mt-10">
          <EmptyState
            icon={<Lock className="h-8 w-8" />}
            title="The rule engine is a Pro feature"
            description="Upgrade to build no-code rulebooks, auto-evaluate every trade, and turn discipline into a measurable score."
            action={
              <Button asChild>
                <Link href="/settings/billing">Upgrade to Pro</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const { books, adherence, ruleCount } = await getRuleBooksWithStats(user.id);
  const activeBooks = books.filter((b) => b.isActive).length;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Rule Engine"
        description="No-code rulebooks evaluated deterministically against every trade."
      >
        <NewRuleBookButton />
      </PageHeader>

      {books.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ShieldCheck className="h-8 w-8" />}
            title="No rulebooks yet"
            description="Create your first rulebook to codify your trading plan — time windows, risk limits, max contracts, behavioral guardrails, and more."
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
              valueClass={scoreColor(adherence)}
              icon={ShieldCheck}
            />
            <SummaryStat
              label="Rulebooks"
              value={`${activeBooks}/${books.length} active`}
              icon={Layers}
            />
            <SummaryStat label="Rules" value={`${ruleCount}`} icon={ScrollText} />
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

                  <div className="flex justify-end pt-1">
                    <AddRuleButton bookId={book.id} />
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
              rule.adherence >= 80 ? "bg-profit" : rule.adherence >= 60 ? "bg-warning" : "bg-loss"
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
