import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { LogoStrip } from "@/components/marketing/logo-strip";
import { Features } from "@/components/marketing/features";
import { DisciplineSection } from "@/components/marketing/discipline-section";
import { Pricing } from "@/components/marketing/pricing";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { signupCtas } from "@/components/marketing/signup-cta";
import { signupMode } from "@/lib/signup-mode";

// Typeface: the home page uses the app's own system font stack (--font-sans in
// globals.css) rather than downloading a web font, so builds work offline and
// the page loads no third-party font files.

// The sign-up mode comes from environment variables that can change between
// deploys, so read it per request (same as the register page) rather than
// baking it in at build time.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  const ctas = signupCtas(signupMode());
  return (
    // Pinned LIGHT per the executed redesign brief ("Score-First Terminal"):
    // dark is for tools you operate, light is for pages you read. The `light`
    // class re-scopes the light tokens even when the OS/user theme is dark;
    // the app itself keeps its dual themes.
    <div className="light min-h-screen bg-background font-sans text-foreground">
      <SiteHeader ctas={ctas} />
      <Hero ctas={ctas} />
      <LogoStrip />
      <Features />
      <DisciplineSection />
      <Pricing ctas={ctas} />
      <FinalCta ctas={ctas} />
      <SiteFooter />
    </div>
  );
}
