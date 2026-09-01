"use client";

import * as React from "react";
import { Check, AlertTriangle } from "lucide-react";
import { PLAN_DEFINITIONS, TRIAL_DAYS, annualSavings } from "@/lib/billing/plans";
import type { BillingInterval, Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ORDER: Plan[] = ["free", "pro", "elite"];

// `annualAvailable` is a plain yes/no worked out on the server — the price ids
// themselves stay server-side and never reach the browser.
export function PlanCards({
  currentPlan,
  annualAvailable = false,
}: {
  currentPlan: Plan;
  annualAvailable?: boolean;
}) {
  const [busy, setBusy] = React.useState<Plan | null>(null);
  const [managing, setManaging] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  // Named billingInterval, not interval — `setInterval` is a browser global.
  const [billingInterval, setBillingInterval] = React.useState<BillingInterval>("monthly");

  async function onUpgrade(plan: Plan) {
    setNotice(null);
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: billingInterval }),
      });
      const json = await res.json();
      // When billing is configured the API returns a checkout URL to redirect
      // to; otherwise it returns a graceful "not configured" message we surface.
      if (json.ok && json.url) {
        window.location.href = json.url as string;
        return;
      }
      setNotice(json.message ?? "Checkout is not available right now.");
    } catch {
      setNotice("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onManage() {
    setNotice(null);
    setManaging(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.url) {
        window.location.href = json.url as string;
        return;
      }
      setNotice(json.message ?? "Subscription management isn't available yet.");
    } catch {
      setNotice("Network error. Please try again.");
    } finally {
      setManaging(false);
    }
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {/* Trial terms up front — the category's #1 trust complaint is hiding them. */}
      <p className="text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{TRIAL_DAYS}-day free trial</span>{" "}
        · no card required · cancel anytime
      </p>

      {/* Monthly / yearly switch. Only shown when yearly is actually on sale —
          otherwise the page looks and behaves exactly as it always has. */}
      {annualAvailable && (
        <div className="flex flex-col items-center gap-1.5">
          <Tabs
            value={billingInterval}
            onValueChange={(v) => setBillingInterval(v as BillingInterval)}
          >
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="annual">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-2xs text-muted-foreground">
            Pay for the year and get {annualSavings("pro").months} months free.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-3">
        {ORDER.map((id) => {
          const plan = PLAN_DEFINITIONS[id];
          const isCurrent = id === currentPlan;
          // A plan is shown yearly only if it has a yearly price at all — the
          // free tier keeps showing $0/mo whichever tab is selected.
          const showAnnual = billingInterval === "annual" && plan.priceAnnual > 0;
          const savedMonths = annualSavings(id).months;
          return (
            <Card
              key={id}
              className={cn(
                "relative flex flex-col",
                plan.highlighted && "border-primary shadow-lg shadow-primary/10",
                isCurrent && "ring-1 ring-primary"
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-foreground">
                  Most popular
                </span>
              )}
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {plan.name}
                  {isCurrent && <Badge variant="profit">Current</Badge>}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="pt-1">
                  <span className="tabular text-3xl font-semibold">
                    ${showAnnual ? plan.priceAnnual : plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {showAnnual ? "/yr" : "/mo"}
                  </span>
                </p>
                {showAnnual && (
                  <p className="text-2xs text-muted-foreground">
                    {savedMonths} months free · ${Math.round(plan.priceAnnual / 12)}/mo billed
                    yearly
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-5">
                  {isCurrent ? (
                    id === "free" ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current plan
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={managing}
                        onClick={onManage}
                      >
                        {managing ? "Opening…" : "Manage subscription"}
                      </Button>
                    )
                  ) : (
                    <Button
                      variant={plan.highlighted ? "default" : "secondary"}
                      className="w-full"
                      disabled={busy === id}
                      onClick={() => onUpgrade(id)}
                    >
                      {busy === id
                        ? "Starting…"
                        : plan.priceMonthly === 0
                          ? "Downgrade"
                          : "Upgrade"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
