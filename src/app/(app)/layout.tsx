import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { resolveTimeZone } from "@/lib/utils";
import { isDemoDesk } from "@/lib/demo-desk";
import { DemoBanner } from "@/components/demo-banner";

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

  // One display zone for the whole app: server pages resolve the same saved
  // zone themselves, client pieces read it from this provider.
  return (
    <TimeZoneProvider timeZone={resolveTimeZone(user.timezone)}>
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
        {/* Under md the fixed bottom bar (64px + the phone's safe-area inset)
            covers the end of the page, so the page ends with that much space
            plus a 16px gap. Desktop has no bar and no extra space. */}
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {isDemoDesk(user.email) && <DemoBanner />}
          {children}
        </main>
        {/* Persistent legal footer — visible in-app on every screen. The bottom
            margin keeps it clear of the fixed mobile nav; print keeps reports clean. */}
        <footer className="mb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col items-center justify-between gap-1.5 border-t border-border px-4 py-3 text-center text-2xs text-muted-foreground sm:flex-row md:mb-0 md:px-6 print:hidden">
          <p>For educational analytics only. Not financial advice.</p>
          <nav className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/refunds" className="hover:text-foreground">Refunds</Link>
          </nav>
        </footer>
        <MobileNav />
      </div>
    </div>
    </TimeZoneProvider>
  );
}
