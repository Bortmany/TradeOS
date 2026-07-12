import Link from "next/link";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="absolute inset-0 grid-texture opacity-70" aria-hidden />
      <div className="relative flex flex-col items-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <p className="mt-6 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Error <span className="tabular">404</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          The chart you were looking for isn&apos;t here. It may have been moved or
          never existed.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
