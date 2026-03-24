export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-10 w-40 bg-muted animate-pulse rounded" />
      </div>

      {/* Table skeleton */}
      <div className="bg-background border rounded-lg shadow-sm overflow-hidden">
        <div className="bg-muted/50 border-b px-4 py-3">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-4 border-b last:border-b-0"
          >
            <div className="w-10 h-10 bg-muted animate-pulse rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
              <div className="h-3 w-1/5 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
