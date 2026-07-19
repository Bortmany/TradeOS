import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for a single trade's detail page — mirrors the real page:
// back link, symbol header with P&L + compliance numbers, then the chart
// workspace (two-thirds) beside the evaluation column (one-third).
export default function TradeDetailLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Back link */}
      <Skeleton className="shimmer h-4 w-32" />

      {/* Header — symbol + badges left, P&L / compliance right */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="shimmer h-8 w-24" />
          <Skeleton className="shimmer h-6 w-14 rounded-full" />
          <Skeleton className="shimmer h-4 w-32" />
        </div>
        <div className="flex items-center gap-6">
          <div className="space-y-2">
            <Skeleton className="shimmer h-3 w-14" />
            <Skeleton className="shimmer h-6 w-20" />
          </div>
          <div className="space-y-2">
            <Skeleton className="shimmer h-3 w-16" />
            <Skeleton className="shimmer h-6 w-12" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — price-action chart + details */}
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="shimmer h-96 w-full rounded-lg" />
          <Skeleton className="shimmer h-48 w-full rounded-lg" />
        </div>
        {/* Right column — rule evaluations + notes */}
        <div className="space-y-6">
          <Skeleton className="shimmer h-72 w-full rounded-lg" />
          <Skeleton className="shimmer h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
