import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCoachingStatus } from "@/lib/ai/status";
import { PageHeader } from "@/components/page-header";
import { CoachPage } from "@/components/coach/coach-page";

export const dynamic = "force-dynamic";

export default async function CoachRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Saved data only: this never calls the model.
  const initial = await getCoachingStatus(user);

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        title="Coach"
        description="Notes on how you followed your rules. They never change your score."
      />
      <CoachPage initial={initial} />
    </div>
  );
}
