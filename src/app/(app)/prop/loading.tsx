import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for the Prop Firm Tracker — mirrors the real page: header,
// four-status count strip, then per-account compliance cards with buffers.
export default function PropLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header */}
      <div className="border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-44" />
          <Skeleton className="shimmer h-4 w-96" />
        </div>
      </div>

      {/* Status strip — on track / at risk / breached / passed */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Skeleton className="shimmer h-3 w-20" />
            <Skeleton className="shimmer mt-3 h-7 w-8" />
          </div>
        ))}
      </div>

      {/* Per-account compliance cards with buffer bars */}
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <Skeleton className="shimmer h-5 w-48" />
              <Skeleton className="shimmer h-6 w-20 rounded-full" />
            </div>
            {/* Drawdown hero: the buffer figure, its bar, and the two new "includes" lines */}
            <div className="mt-5 space-y-2">
              <Skeleton className="shimmer h-9 w-40" />
              <Skeleton className="shimmer h-1.5 w-full rounded-full" />
              <Skeleton className="shimmer h-3 w-56" />
              <Skeleton className="shimmer h-3 w-40" />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="shimmer h-3 w-24" />
                  <Skeleton className="shimmer h-2 w-full rounded-full" />
                  <Skeleton className="shimmer h-3 w-16" />
                </div>
              ))}
            </div>
            {/* Open positions section: two row stubs */}
            <div className="mt-5 space-y-2 border-t border-border pt-3">
              {Array.from({ length: 2 }).map((_, k) => (
                <div key={k} className="flex h-12 items-center justify-between rounded-lg border border-border px-3">
                  <div className="space-y-1.5">
                    <Skeleton className="shimmer h-3.5 w-28" />
                    <Skeleton className="shimmer h-2.5 w-40" />
                  </div>
                  <Skeleton className="shimmer h-4 w-[72px]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
