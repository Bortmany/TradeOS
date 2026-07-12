import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });

  const planName = PLAN_DEFINITIONS[user.plan as Plan]?.name ?? user.plan;

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader title="Settings" description="Manage your profile and preferences." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your name and the timezone your sessions are bucketed in.
            </p>
          </CardHeader>
          <CardContent>
            <ProfileForm displayName={user.displayName ?? ""} timezone={user.timezone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Account</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Sign-in and subscription details.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/billing">Billing</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Email" value={user.email} />
            <Row
              label="Plan"
              value={
                <span className="inline-flex items-center gap-2">
                  {planName}
                  <Badge variant="info" className="capitalize">
                    {user.billingStatus.replace("_", " ")}
                  </Badge>
                </span>
              }
            />
            <Row
              label="Member since"
              value={dbUser ? formatDate(dbUser.createdAt) : "—"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}
