import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for the Dashboard — mirrors the real page: header, the
// discipline-score hero (ring on its own row, four
// meters underneath), KPI row, equity + violations, charts.
export default function DashboardLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with account switcher */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-40" />
          <Skeleton className="shimmer h-4 w-56" />
        </div>
        <Skeleton className="shimmer h-9 w-44" />
      </div>

      {/* Discipline hero — the score ring on its own row, four meters underneath */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="shimmer h-5 w-36" />
            <Skeleton className="shimmer h-4 w-72" />
          </div>
          <Skeleton className="shimmer h-10 w-28" />
        </div>
        <div className="mt-6 space-y-5">
          <div className="flex flex-col items-center gap-1.5 py-2">
            <Skeleton className="shimmer h-[208px] w-[208px] rounded-full" />
            <Skeleton className="shimmer h-3 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="shimmer h-3 w-20" />
                <Skeleton className="shimmer h-1 w-full rounded-full" />
                <Skeleton className="shimmer h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Skeleton className="shimmer h-3 w-16" />
            <Skeleton className="shimmer mt-3 h-7 w-24" />
            <Skeleton className="shimmer mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Equity curve + recent violations */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="shimmer h-80 w-full rounded-lg lg:col-span-2" />
        <Skeleton className="shimmer h-80 w-full rounded-lg" />
      </div>

      {/* Session / weekday charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="shimmer h-72 w-full rounded-lg" />
        <Skeleton className="shimmer h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}
