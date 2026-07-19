import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for the Trade Journal — mirrors the real page: header with
// the trade-count badge, the filter bar, then the trades table.
export default function JournalLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with the trade-count badge */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-40" />
          <Skeleton className="shimmer h-4 w-80" />
        </div>
        <Skeleton className="shimmer h-6 w-20 rounded-full" />
      </div>

      {/* Filter bar — one shimmer per dropdown */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-9 w-36" />
        ))}
      </div>

      {/* Trades table — header row + rows */}
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="shimmer h-4 w-full" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
