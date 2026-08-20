import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { ADAPTERS } from "@/lib/ingestion";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Wallet, ShieldCheck, EyeOff, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { ImportWizard } from "@/components/import/import-wizard";
import { BrokerConnect } from "@/components/import/broker-connect";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = await getAccounts(user.id);

  // Broker options (excluding the generic fallback which is "Auto-detect" territory).
  const brokers = ADAPTERS.map((a) => ({ key: a.key, label: a.label }));

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Import"
        description="Bring in trades from a broker CSV or log one by hand."
      />

      {/* Trust strip — the first thing a nervous trader should read. Importing
          means handing over trade history, so the three promises that matter
          (read-only, private, no lock-in) lead the page. */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 sm:grid-cols-3">
        <TrustPoint
          icon={<ShieldCheck className="h-4 w-4 text-profit" />}
          title="Read-only access"
          detail="TradeOS reads your trades. It can never place, change or cancel an order."
        />
        <TrustPoint
          icon={<EyeOff className="h-4 w-4 text-profit" />}
          title="Your data stays yours"
          detail="Nothing is shared or sold. A CSV is read in your browser and only uploads when you press Import."
        />
        <TrustPoint
          icon={<FileSpreadsheet className="h-4 w-4 text-profit" />}
          title="Works with any broker"
          detail="No connection needed — a plain CSV export is enough to get started."
        />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Add an account first"
          description="Imports land in a trading account, so create one before bringing in trades."
          steps={[
            { label: "Create a trading account (live, prop, or paper)" },
            { label: "Upload a broker CSV or connect TopstepX below" },
            { label: "Trades hit your journal, graded against your rules" },
          ]}
          action={
            <Button asChild>
              <Link href="/accounts">Go to Accounts</Link>
            </Button>
          }
        />
      ) : (
        <ImportWizard
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
          brokers={brokers}
        />
      )}

      <BrokerConnect />
    </div>
  );
}

function TrustPoint({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-2xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
