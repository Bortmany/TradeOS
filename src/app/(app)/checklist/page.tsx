import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLastRun, listRuns, listTemplates, rulebookIdsForAccount } from "@/lib/checklist/data";
import { PageHeader } from "@/components/page-header";
import { ChecklistManager } from "@/components/checklist/checklist-manager";
import { isDemoDesk } from "@/lib/demo-desk";
import { DEMO_STARTER_TEMPLATE } from "@/lib/checklist";

export const dynamic = "force-dynamic";

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; account?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tab, account } = await searchParams;
  const demo = isDemoDesk(user.email);

  const [templates, recent, lastRun, rulebooks] = await Promise.all([
    listTemplates(user.id),
    listRuns(user.id, { limit: 10, offset: 0 }),
    getLastRun(user.id),
    prisma.ruleBook.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const shown = templates.length === 0 && demo ? [DEMO_STARTER_TEMPLATE] : templates;
  const bookIds = await rulebookIdsForAccount(user.id, account ?? null);
  const preselect =
    shown.find((t) => t.isActive && t.ruleBookId && bookIds.includes(t.ruleBookId))?.id ?? null;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Checklist"
        description="Your own questions to answer before you trade. It only reminds you. It never blocks a trade or changes your score."
      />
      <ChecklistManager
        templates={shown}
        runs={recent.runs}
        hasMoreRuns={recent.hasMore}
        rulebooks={rulebooks}
        lastRun={
          lastRun
            ? { checkedCount: lastRun.checkedCount, totalCount: lastRun.totalCount, createdAt: lastRun.createdAt }
            : null
        }
        preselectId={preselect}
        demo={demo}
        initialTab={tab === "lists" ? "lists" : tab === "runs" ? "runs" : "run"}
      />
    </div>
  );
}
