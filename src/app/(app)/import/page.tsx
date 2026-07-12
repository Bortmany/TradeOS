import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { ADAPTERS } from "@/lib/ingestion";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
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
