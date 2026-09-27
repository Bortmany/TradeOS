import Link from "next/link";
import { Activity } from "lucide-react";
import { legalContactEmail } from "@/lib/legal-contact";

// Shared frame for the legal pages (/terms, /privacy, /refunds). Public,
// readable from both the marketing site and inside the app, so it follows the
// user's theme. The contact line is rendered here once so every legal page
// shows the same address (PRIVACY_CONTACT_EMAIL, read server-side).
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contactEmail = legalContactEmail();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight">TradeOS</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/refunds" className="hover:text-foreground">Refunds</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="container max-w-3xl py-12">
        {children}
        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Contact:</span>{" "}
          questions about this page, your data, or a refund go to{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {contactEmail}
          </a>
          .
        </p>
      </main>
      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-xs text-muted-foreground sm:flex-row">
          <span>TradeOS © {new Date().getFullYear()}</span>
          <p>For educational analytics only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
