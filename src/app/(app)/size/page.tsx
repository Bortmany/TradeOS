import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { SizeCalculator, type SizeAccount } from "@/components/sizing/size-calculator";

export const dynamic = "force-dynamic";

export default async function SizePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The calculator still works if the accounts fail to load: it just asks for
  // the account size by hand.
  let accounts: SizeAccount[] = [];
  let accountsFailed = false;
  try {
    accounts = (await getAccounts(user.id)).map((a) => ({
      id: a.id,
      name: a.name,
      startingBalance: a.startingBalance,
      currency: a.currency,
    }));
  } catch {
    accountsFailed = true;
  }

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Position size"
        description="How many contracts or lots fit your risk. Just arithmetic: nothing is sent to your broker."
      />
      <SizeCalculator accounts={accounts} accountsFailed={accountsFailed} />
    </div>
  );
}
