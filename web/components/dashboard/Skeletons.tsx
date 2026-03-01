"use client";

function SkeletonBox({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} />;
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
            <SkeletonBox className="h-3 w-24 mb-3" />
            <SkeletonBox className="h-7 w-16" />
          </div>
        ))}
      </div>
      {/* Activity feed rows */}
      <div className="space-y-2">
        <SkeletonBox className="h-4 w-28 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary p-3">
            <SkeletonBox className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <SkeletonBox className="h-3 w-48" />
              <SkeletonBox className="h-2.5 w-32" />
            </div>
            <SkeletonBox className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrdersPageSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter tab pills */}
      <div className="flex gap-4 border-b border-border-default pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} className="h-4 w-16" />
        ))}
      </div>
      {/* Order rows */}
      <div className="divide-y divide-border-default rounded-xl border border-border-default bg-bg-secondary shadow-sm">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-4 w-40" />
                <SkeletonBox className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-3 w-12" />
                <SkeletonBox className="h-3 w-20" />
                <SkeletonBox className="h-3 w-16" />
              </div>
            </div>
            <SkeletonBox className="h-4 w-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
