import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for Import — mirrors the real page: header, the import
// wizard card, then the broker-connect card underneath.
export default function ImportLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header */}
      <div className="border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-24" />
          <Skeleton className="shimmer h-4 w-80" />
        </div>
      </div>

      {/* Import wizard — account/broker pickers + drop zone */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="shimmer h-9 w-48" />
          <Skeleton className="shimmer h-9 w-48" />
        </div>
        <Skeleton className="shimmer mt-5 h-40 w-full rounded-lg" />
      </div>

      {/* Broker connect */}
      <Skeleton className="shimmer h-40 w-full rounded-lg" />
    </div>
  );
}
