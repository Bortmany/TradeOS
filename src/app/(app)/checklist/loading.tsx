import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for /checklist: header, the three tabs, then a card shaped
// like the tick-through (title, progress stub, five rows, button).
export default function ChecklistLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="shimmer h-6 w-32" />
        <Skeleton className="shimmer h-4 w-full max-w-lg" />
      </div>
      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="shimmer h-11 w-full" />
          <div className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm">
            <Skeleton className="shimmer h-4 w-40" />
            <Skeleton className="shimmer h-1.5 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex h-[52px] items-center justify-between rounded-lg border border-border px-3">
                <Skeleton className="shimmer h-4 w-2/3" />
                <Skeleton className="shimmer h-7 w-7 rounded-full" />
              </div>
            ))}
            <Skeleton className="shimmer h-11 w-full" />
          </div>
        </div>
        <div className="mt-6 hidden space-y-2 lg:mt-0 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
