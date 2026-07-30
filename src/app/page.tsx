import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Trophy,
  Upload,
  Brain,
  LineChart,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    // The marketing page is always dark regardless of the user's app theme.
    <div className="dark min-h-screen bg-background text-foreground">
      <SiteHeader />
      <Hero />
      <LogoStrip />
      <Features />
      <DisciplineSection />
      <Pricing />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">TradeOS</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#discipline" className="hover:text-foreground">Discipline</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-texture opacity-50" />
      <div className="container relative py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="flex h-1.5 w-1.5 rounded-full bg-profit" />
            Built for funded & live day traders
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
            Your trading, held to
            <span className="text-primary"> your own rules.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground">
            TradeOS imports your trades, grades every one against your rulebook, and
            turns raw fills into a discipline score you can actually improve.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/register">
                Start 14-day free trial <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/login">Explore the demo desk</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No card required · Import from Topstep, Tradovate, NinjaTrader, Rithmic & IBKR
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <div className="card-highlight rounded-xl border border-border bg-surface p-2">
            {/* Real product, not a mockup — the score-first dashboard. */}
            <img
              src="/screenshots/dashboard-dark.png"
              alt="The TradeOS dashboard: discipline score with rule adherence, risk, emotion and consistency breakdowns above the equity curve"
              width={1360}
              height={850}
              className="rounded-lg border border-border"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  const names = ["Topstep", "Apex", "Tradovate", "NinjaTrader", "Rithmic", "Interactive Brokers"];
  return (
    <section className="border-b border-border">
      <div className="container py-8">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Normalizes data from the platforms you already trade
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {names.map((n) => (
            <span key={n} className="text-sm font-medium text-muted-foreground/70">
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Upload,
    title: "Import from anywhere",
    body: "CSV, manual entry, and a plugin-based connector layer. Every broker is normalized into one clean schema.",
  },
  {
    icon: BarChart3,
    title: "Analytics with an edge",
    body: "Performance by session, weekday, time of day, symbol and strategy. Expectancy, profit factor, drawdown — explained.",
  },
  {
    icon: ShieldCheck,
    title: "No-code rule engine",
    body: "Define time windows, risk limits, and anti-revenge rules. Every trade is graded pass/fail, automatically.",
  },
  {
    icon: Brain,
    title: "Discipline score",
    body: "A deterministic, explainable 0–100 score across rule adherence, risk, emotion, and consistency.",
  },
  {
    icon: Trophy,
    title: "Prop-firm tracker",
    body: "Topstep, Apex & TPT presets. Watch daily loss limits and trailing drawdown before you breach them.",
  },
  {
    icon: LineChart,
    title: "Reports that coach",
    body: "Daily, weekly and monthly rollups surfacing your best trades — and the mistakes quietly costing you money.",
  },
];

function Features() {
  return (
    <section id="features" className="border-b border-border">
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Not a journal. A discipline system.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Journals tell you what happened. TradeOS tells you whether you followed
            your process — and what to fix next.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DisciplineSection() {
  const rows = [
    { label: "Traded inside your window", ok: true },
    { label: "Position within max contracts", ok: true },
    { label: "No revenge trade after a loss", ok: false },
    { label: "Respected daily loss limit", ok: true },
  ];
  return (
    <section id="discipline" className="border-b border-border">
      <div className="container grid items-center gap-12 py-20 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-primary">The core loop</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Every trade, graded against the rules you actually trade.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Blowups rarely come from bad setups — they come from broken rules under
            pressure. TradeOS makes that measurable, so &quot;stop revenge trading&quot;
            becomes a number that goes up.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            {[
              "Deterministic scoring — no black-box AI required",
              "Full audit trail for every rule evaluation",
              "Works across every linked account",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-profit" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Trade #1428 · NQ short
              </p>
              <p className="mt-0.5 text-lg font-semibold text-loss tabular">−$310</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance</p>
              <p className="text-2xl font-semibold text-warning tabular">72</p>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm"
              >
                <span>{r.label}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-2xs font-semibold uppercase",
                    r.ok ? "bg-profit-muted text-profit" : "bg-loss-muted text-loss"
                  )}
                >
                  {r.ok ? "Pass" : "Fail"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = Object.values(PLAN_DEFINITIONS);
  return (
    <section id="pricing" className="border-b border-border">
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Priced like one good trade a month.
          </h2>
          <p className="mt-3 text-muted-foreground">
            14-day full-access free trial · no card required · cancel anytime. Refunds, plainly: if it is not for you in the first 14 days, you pay nothing.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-surface p-6",
                plan.highlighted ? "card-highlight border-primary" : "border-border"
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
                <span className="text-4xl font-semibold tabular">${plan.priceMonthly}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-6 w-full"
                variant={plan.highlighted ? "default" : "secondary"}
              >
                <Link href="/register">
                  {plan.priceMonthly === 0 ? "Start free" : "Start trial"}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-b border-border">
      <div className="container py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Stop guessing why you&apos;re not consistent.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
          Import your last 30 days and see your discipline score in under five minutes.
        </p>
        <Button asChild size="lg" className="mt-7 gap-2">
          <Link href="/register">
            Start your free trial <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground sm:flex-row">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground">
          <Activity className="h-3 w-3" strokeWidth={2.5} />
        </div>
        <span>TradeOS © {new Date().getFullYear()}</span>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-5">
        <nav className="flex items-center gap-4 text-xs">
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </nav>
        <p className="text-xs">
          For educational analytics only. Not financial advice.
        </p>
      </div>
    </footer>
  );
}
