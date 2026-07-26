import Link from "next/link";
import { Activity } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground sm:flex-row">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground">
          <Activity className="h-3 w-3" strokeWidth={2.5} />
        </div>
        <span>TradeOS © {new Date().getFullYear()}</span>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-5">
        <nav className="flex items-center gap-4 text-xs">
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </nav>
        <p className="text-xs">
          For educational analytics only. Not financial advice.
        </p>
      </div>
    </footer>
  );
}
