import {
  BarChart3,
  Brain,
  LineChart,
  ShieldCheck,
  Trophy,
  Upload,
} from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

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

export function Features() {
  return (
    <section id="features" className="border-b border-border">
      <div className="container py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Not a journal. A discipline system.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Journals tell you what happened. TradeOS tells you whether you followed
              your process — and what to fix next.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </Reveal>
      </div>
    </section>
  );
}
