import Link from "next/link";
import { Activity } from "lucide-react";

// Shared frame for the legal pages (/terms, /privacy). Public, readable from
// both the marketing site and inside the app, so it follows the user's theme.
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="container max-w-3xl py-12">{children}</main>
      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-xs text-muted-foreground sm:flex-row">
          <span>TradeOS © {new Date().getFullYear()}</span>
          <p>For educational analytics only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
