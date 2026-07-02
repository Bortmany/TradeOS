import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const trialDaysLeft =
    user.billingStatus === "trialing" && user.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(user.trialEndsAt).getTime() - Date.now()) / 86_400_000
          )
        )
      : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{
            email: user.email,
            displayName: user.displayName,
            plan: user.plan,
            billingStatus: user.billingStatus,
          }}
          trialDaysLeft={trialDaysLeft}
        />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
