import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ADAPTERS } from "@/lib/ingestion";
import { PageHeader } from "@/components/page-header";
import { ShieldCheck, EyeOff, FileSpreadsheet } from "lucide-react";
import { ImportWizard } from "@/components/import/import-wizard";
import { BrokerConnect } from "@/components/import/broker-connect";
import { Mt5LiveCard } from "@/components/import/mt5-live-card";
import { metaApiSwitchedOn } from "@/lib/connectors/firms";
import {
  MT5_MAX_ACCOUNTS,
  countMt5Connections,
  mt5PlanAllowed,
} from "@/lib/connectors/mt5-access";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = await getAccounts(user.id);

  // Broker options (excluding the generic fallback which is "Auto-detect" territory).
  const brokers = ADAPTERS.map((a) => ({ key: a.key, label: a.label }));

  const mt5On = metaApiSwitchedOn();
  const mt5Plan = mt5On && mt5PlanAllowed({ plan: user.plan, billingStatus: user.billingStatus });
  const mt5Count = mt5On ? await countMt5Connections(user.id) : 0;
  // Accounts a live MT5 link can attach to: the trader's own, in US dollars, not linked to a broker yet.
  const linkedIds = mt5On
    ? new Set(
        (await prisma.brokerConnection.findMany({ where: { userId: user.id }, select: { accountId: true } })).map(
          (c) => c.accountId
        )
      )
    : new Set<string>();
  const mt5Targets = accounts
    .filter((a) => a.currency.trim().toUpperCase() === "USD" && !linkedIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));

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

      {/* The file picker is here from the first visit. With no trading account yet the
          "Import into" control starts on "Create a new account" (name + balance). */}
      <ImportWizard
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
        brokers={brokers}
      />

      <BrokerConnect />

      {/* MT5 live link: HIDDEN until the owner switches it on (METAAPI_ENABLED + token). */}
      {mt5On && <Mt5LiveCard planAllowed={mt5Plan} count={mt5Count} max={MT5_MAX_ACCOUNTS} accounts={mt5Targets} />}
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
