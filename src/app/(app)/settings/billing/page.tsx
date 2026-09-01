import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles, Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_DEFINITIONS, effectivePlan } from "@/lib/billing/plans";
import { annualPricingAvailable } from "@/lib/billing/paddle";
import type { Plan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { PlanCards } from "@/components/settings/plan-cards";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const plan = user.plan as Plan;
  const effective = effectivePlan(plan, user.billingStatus);
  const planDef = PLAN_DEFINITIONS[plan];

  const trialDaysLeft =
    user.billingStatus === "trialing" && user.trialEndsAt
      ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader title="Billing" description="Your plan, trial status, and upgrades.">
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </PageHeader>

      {/* Current plan / trial banner */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">
              You're on {planDef?.name ?? plan}
              <Badge variant="info" className="ml-2 capitalize">
                {user.billingStatus.replace("_", " ")}
              </Badge>
            </p>
            <p className="text-2xs text-muted-foreground">
              {effective !== plan
                ? `Currently getting ${PLAN_DEFINITIONS[effective].name}-level access.`
                : planDef?.tagline}
            </p>
          </div>
        </div>
        {trialDaysLeft !== null && (
          <div className="flex items-center gap-2 rounded-md bg-warning-muted px-3 py-1.5 text-sm text-warning">
            <Clock className="h-4 w-4" />
            {trialDaysLeft === 0
              ? "Trial ends today"
              : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial`}
          </div>
        )}
      </div>

      {/* Whether a year can be bought is decided on the server; the browser is
          only ever told yes or no, never the payment provider's price ids. */}
      <PlanCards currentPlan={plan} annualAvailable={annualPricingAvailable()} />

      <p className="pt-2 text-center text-2xs text-muted-foreground">
        Payments are processed securely by Paddle, our reseller and merchant of record.
        Cancel anytime — see our{" "}
        <Link href="/refunds" className="text-primary underline-offset-2 hover:underline">
          refund policy
        </Link>
        .
      </p>
    </div>
  );
}
