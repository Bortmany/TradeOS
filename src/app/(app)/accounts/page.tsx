import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccountsWithStats } from "@/lib/accounts-data";
import { withinLimit, getFeatures, effectivePlan } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { AccountDialog } from "@/components/accounts/account-dialog";
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
import { formatCurrency, formatPercent, pnlColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_VARIANT: Record<string, "profit" | "info" | "warning" | "secondary"> = {
  funded: "profit",
  live: "info",
  evaluation: "warning",
  demo: "secondary",
};

function pf(v: number): string {
  return isFinite(v) ? v.toFixed(2) : "∞";
}

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = await getAccountsWithStats(user.id);

  const limit = getFeatures(effectivePlan(user.plan as Plan, user.billingStatus)).maxAccounts;
  const atLimit = !withinLimit(user.plan as Plan, user.billingStatus, "maxAccounts", accounts.length);
  const limitText = isFinite(limit)
    ? `${accounts.length} of ${limit} account${limit === 1 ? "" : "s"} used on your plan.`
    : "Unlimited accounts on your plan.";
  const limitLabel = atLimit
    ? "You've reached your plan's account limit. Upgrade to add more."
    : limitText;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Accounts"
        description="Every trading account you track, with realized performance at a glance."
      >
        <AccountDialog disabled={atLimit} limitLabel={limitLabel} />
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No accounts yet"
          description="Add your first trading account to start importing trades and tracking performance."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: a.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {a.broker}
                        </p>
                      </div>
                    </div>
                    <Badge variant={KIND_VARIANT[a.kind] ?? "secondary"} className="capitalize">
                      {a.kind}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                        Net P&L
                      </p>
                      <p className={`text-xl font-semibold tabular ${pnlColor(a.stats.netPnl)}`}>
                        {formatCurrency(a.stats.netPnl, { sign: true })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                        Balance
                      </p>
                      <p className="tabular text-sm text-muted-foreground">
                        {formatCurrency(a.startingBalance)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                    <Metric label="Trades" value={String(a.stats.tradeCount)} />
                    <Metric label="Win rate" value={formatPercent(a.stats.winRate)} />
                    <Metric label="Profit factor" value={pf(a.stats.profitFactor)} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Net P&L</TableHead>
                      <TableHead className="text-right">Win rate</TableHead>
                      <TableHead className="text-right">Profit factor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: a.color }}
                            />
                            <span className="font-medium">{a.name}</span>
                            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                              {a.kind}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right tabular ${pnlColor(a.stats.netPnl)}`}>
                          {formatCurrency(a.stats.netPnl, { sign: true })}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatPercent(a.stats.winRate)}
                        </TableCell>
                        <TableCell className="text-right tabular">{pf(a.stats.profitFactor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-medium">{value}</p>
    </div>
  );
}
