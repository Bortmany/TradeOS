import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoDeskButton } from "@/components/demo-desk-button";
import { GradeDemo } from "@/components/marketing/grade-demo";
import type { SignupCtas } from "@/components/marketing/signup-cta";

export function Hero({ ctas }: { ctas: SignupCtas }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-texture opacity-50 print:hidden" />
      <div className="container relative py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
              <span className="flex h-1.5 w-1.5 rounded-full bg-profit" />
              Built for funded &amp; live day traders
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
              Your trading, held to
              <span className="text-primary"> your own rules.</span>
            </h1>
            <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
              The trading journal that keeps you honest. TradeOS imports your trades,
              grades every one against your rulebook, and warns you at 50%, 80% and
              100% of a limit. You decide what to do next.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href={ctas.href}>
                  {ctas.primary} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {ctas.mode !== "closed" && (
                <DemoDeskButton size="lg" />
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {ctas.notice ?? "No card required"} · Import from Topstep, Tradovate,
              NinjaTrader, Rithmic &amp; IBKR
            </p>
          </div>

          {/* The hero visual IS the product's whole point: a trade graded
              rule-by-rule. Interactive — and the one entrance-motion moment
              the redesign brief allows. */}
          <div className="motion-safe:animate-rise-in">
            <GradeDemo />
          </div>
        </div>

        {/* Real product screenshot — the dark app on a light page, on purpose:
            it proves the product exists and looks striking (see design brief). */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="rounded-xl border border-border bg-surface p-2 shadow-2xl">
            <img
              src="/screenshots/dashboard-dark.png"
              alt="The TradeOS dashboard: discipline score with rule adherence, risk, emotion and consistency breakdowns above the equity curve"
              width={1360}
              height={850}
              className="rounded-lg border border-border"
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            The real dashboard — not a mockup.
          </p>
        </div>
      </div>
    </section>
  );
}
