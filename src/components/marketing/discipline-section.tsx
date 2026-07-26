import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

export function DisciplineSection() {
  return (
    <section id="discipline" className="border-b border-border">
      <div className="container py-20">
        <Reveal>
          <div className="grid items-center gap-12 lg:grid-cols-2">
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
            {/* Real screenshot of the journal — every trade carrying its score
                chip — rather than a mocked-up card (the hero already shows the
                live grading demo). */}
            <div>
              <div className="rounded-xl border border-border bg-surface p-2 shadow-xl">
                <img
                  src="/screenshots/journal-dark.png"
                  alt="The TradeOS trade journal: every imported trade listed with its P&L and its discipline score chip"
                  width={1360}
                  height={850}
                  className="rounded-lg border border-border"
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                The journal, straight from the app — every trade carries its score.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
