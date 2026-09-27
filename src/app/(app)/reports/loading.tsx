import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for Reports — mirrors the real page: header with the print
// button, the period tab row, the performance stat card, then table cards.
export default function ReportsLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with the print button */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-28" />
          <Skeleton className="shimmer h-4 w-72" />
        </div>
        <Skeleton className="shimmer h-9 w-28" />
      </div>

      {/* Period tabs + date range */}
      <div className="flex items-center justify-between">
        <Skeleton className="shimmer h-9 w-56 rounded-md" />
        <Skeleton className="shimmer h-3 w-40" />
      </div>

      {/* Performance summary — stat grid */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="shimmer h-5 w-44" />
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="shimmer h-3 w-20" />
              <Skeleton className="shimmer h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Compliance + trade table */}
      <Skeleton className="shimmer h-56 w-full rounded-lg" />
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
