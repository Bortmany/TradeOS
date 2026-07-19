import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for Accounts — mirrors the real page: header with the
// add-account button, three-stat summary strip, then the account card grid.
export default function AccountsLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with the add-account button */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-32" />
          <Skeleton className="shimmer h-4 w-80" />
        </div>
        <Skeleton className="shimmer h-9 w-32" />
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Skeleton className="shimmer h-3 w-24" />
            <Skeleton className="shimmer mt-3 h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Account cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Skeleton className="shimmer h-2.5 w-2.5 rounded-full" />
              <Skeleton className="shimmer h-4 w-32" />
            </div>
            <Skeleton className="shimmer mt-4 h-7 w-24" />
            <Skeleton className="shimmer mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
