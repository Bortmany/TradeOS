import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, TrendingUp, ShieldCheck, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">TradeOS</span>
        </Link>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden overflow-hidden border-l border-border bg-surface lg:block">
        <div className="absolute inset-0 grid-texture opacity-70" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-sm font-medium text-primary">Trading discipline, quantified</p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Your edge isn&apos;t a better setup. It&apos;s doing the same right thing every time.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            TradeOS imports your trades, scores them against your own rulebook, and
            shows you exactly where discipline breaks down — before it costs you a payout.
          </p>
          <ul className="mt-8 space-y-4">
            <Feature icon={TrendingUp} title="Analytics that mean something">
              Performance by session, strategy, and time of day — not vanity charts.
            </Feature>
            <Feature icon={ShieldCheck} title="Rule engine + discipline score">
              Every trade graded pass/fail against the rules you actually trade.
            </Feature>
            <Feature icon={Trophy} title="Prop-firm guardrails">
              Track daily loss limits and trailing drawdown before you breach them.
            </Feature>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
