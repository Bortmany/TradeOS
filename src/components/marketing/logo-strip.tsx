const NAMES = [
  "Topstep",
  "Apex",
  "Tradovate",
  "NinjaTrader",
  "Rithmic",
  "Interactive Brokers",
];

export function LogoStrip() {
  return (
    <section className="border-b border-border">
      <div className="container py-8">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Normalizes data from the platforms you already trade
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {NAMES.map((n) => (
            <span key={n} className="text-sm font-medium text-muted-foreground/70">
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
