import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for /size: a block the shape of the answer card, an inputs
// card with four input shapes, and a working card with four rows.
export default function SizeLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <div className="space-y-1 border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight">Position size</h1>
        <p className="text-sm text-muted-foreground">
          How many contracts or lots fit your risk. Just arithmetic: nothing is sent to your broker.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="shimmer h-32 w-full lg:col-span-3 lg:col-start-3 lg:row-start-1" />
        <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="shimmer h-4 w-24" />
              <Skeleton className="shimmer h-11 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm lg:col-span-3 lg:col-start-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
