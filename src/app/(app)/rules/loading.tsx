import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for the Rule Engine — mirrors the real page: header with
// the new-rulebook button, three-stat summary strip, then rulebook cards.
export default function RulesLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with the new-rulebook button */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-32" />
          <Skeleton className="shimmer h-4 w-80" />
        </div>
        <Skeleton className="shimmer h-9 w-36" />
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Skeleton className="shimmer h-3 w-28" />
            <Skeleton className="shimmer mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Rulebook cards — title row, then rule rows */}
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="shimmer h-5 w-40" />
                <Skeleton className="shimmer h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="shimmer h-8 w-24" />
            </div>
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="shimmer h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
