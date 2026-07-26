import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { LogoStrip } from "@/components/marketing/logo-strip";
import { Features } from "@/components/marketing/features";
import { DisciplineSection } from "@/components/marketing/discipline-section";
import { Pricing } from "@/components/marketing/pricing";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { cn } from "@/lib/utils";

// Marketing-page-only typeface. `variable: "--font-sans"` slots Inter into the
// existing font token for this subtree only — the app keeps the system stack.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export default function LandingPage() {
  return (
    // Pinned LIGHT per the executed redesign brief ("Score-First Terminal"):
    // dark is for tools you operate, light is for pages you read. The `light`
    // class re-scopes the light tokens even when the OS/user theme is dark;
    // the app itself keeps its dual themes.
    <div
      className={cn(
        "light min-h-screen bg-background font-sans text-foreground",
        inter.variable
      )}
    >
      <SiteHeader />
      <Hero />
      <LogoStrip />
      <Features />
      <DisciplineSection />
      <Pricing />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}
