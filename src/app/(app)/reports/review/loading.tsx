import { Skeleton } from "@/components/ui/skeleton";

// Loading shimmer for the Weekly Review — mirrors the real page: header with the
// back button, the week picker, the week-in-numbers card, the three questions
// and the list of earlier reviews.
export default function WeeklyReviewLoading() {
  return (
    <div className="container max-w-7xl space-y-6 py-6">
      {/* Page header with the back-to-reports button */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="shimmer h-6 w-40" />
          <Skeleton className="shimmer h-4 w-80" />
        </div>
        <Skeleton className="shimmer h-9 w-32" />
      </div>

      {/* Week picker */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
        <Skeleton className="shimmer h-8 w-32" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="shimmer h-4 w-44" />
          <Skeleton className="shimmer h-3 w-16" />
        </div>
        <Skeleton className="shimmer h-8 w-32" />
      </div>

      {/* The week in numbers */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="shimmer h-5 w-44" />
            <Skeleton className="shimmer h-4 w-72" />
          </div>
          <Skeleton className="shimmer h-6 w-20 rounded-full" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="shimmer h-3 w-20" />
              <Skeleton className="shimmer h-6 w-24" />
              <Skeleton className="shimmer h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Three questions */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="shimmer h-5 w-36" />
        <Skeleton className="shimmer mt-2 h-4 w-80" />
        <div className="mt-6 space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="shimmer h-4 w-56" />
              <Skeleton className="shimmer h-20 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="shimmer h-9 w-32" />
        </div>
      </div>

      {/* Earlier reviews */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="shimmer h-5 w-36" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="shimmer h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
