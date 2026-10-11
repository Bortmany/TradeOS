import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_DEFINITIONS, annualSavings } from "@/lib/billing/plans";
import type { SignupCtas } from "@/components/marketing/signup-cta";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils";

export function Pricing({ ctas }: { ctas: SignupCtas }) {
  const plans = Object.values(PLAN_DEFINITIONS);
  return (
    <section id="pricing" className="scroll-mt-14 border-b border-border">
      <div className="container py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Priced like one good trade a month.
            </h2>
            {ctas.showTrialTerms && (
              <p className="mt-3 text-muted-foreground">
                14-day full-access free trial · no card required · cancel anytime.
                Refunds, plainly: if it is not for you in the first 14 days, you pay nothing.
              </p>
            )}
            {ctas.notice && (
              <p className="mt-3 text-sm font-medium text-foreground">{ctas.notice}</p>
            )}
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-surface p-6",
                  plan.highlighted
                    ? "border-primary shadow-lg shadow-primary/10"
                    : "border-border"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tabular">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                {plan.priceAnnual > 0 && (
                  <p className="mt-1 text-2xs text-muted-foreground">
                    or ${plan.priceAnnual}/yr — {annualSavings(plan.id).months} months free
                  </p>
                )}
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
                {ctas.mode === "closed" ? (
                  <Button className="mt-6 w-full" variant="secondary" disabled>
                    {ctas.paidPlan}
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="mt-6 w-full"
                    variant={plan.highlighted ? "default" : "secondary"}
                  >
                    <Link href={ctas.href}>
                      {plan.priceMonthly === 0 ? ctas.freePlan : ctas.paidPlan}
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
