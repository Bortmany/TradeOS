import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Card-shaped shimmer block matching the dashboard's layout rhythm. */
function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shimmer rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    />
  );
}

export default function AppLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-40" />
          <Skeleton className="shimmer h-4 w-56" />
        </div>
        <Skeleton className="shimmer h-9 w-44" />
      </div>
      {/* Hero card (discipline score) */}
      <CardSkeleton className="h-56 w-full" />
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      {/* Chart + side panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CardSkeleton className="h-80 w-full lg:col-span-2" />
        <CardSkeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
