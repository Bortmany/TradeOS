import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for Analytics — mirrors the real page: header, the
// performance-metrics stat grid, drawdown chart, three time charts, tables.
export default function AnalyticsLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with account switcher */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-32" />
          <Skeleton className="shimmer h-4 w-56" />
        </div>
        <Skeleton className="shimmer h-9 w-44" />
      </div>

      {/* Performance metrics — grid of small stats */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="shimmer h-5 w-44" />
        <Skeleton className="shimmer mt-2 h-4 w-64" />
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="shimmer h-3 w-20" />
              <Skeleton className="shimmer h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Drawdown chart */}
      <Skeleton className="shimmer h-80 w-full rounded-lg" />

      {/* By hour / weekday / session */}
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-64 w-full rounded-lg" />
        ))}
      </div>

      {/* Strategy + symbol breakdown tables */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="shimmer h-5 w-28" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-9 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="shimmer h-72 w-full rounded-lg" />
    </div>
  );
}
