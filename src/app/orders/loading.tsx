export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Heading skeleton */}
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />

          {/* 3 order card skeletons */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-5 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                </div>
                <div className="h-5 w-28 bg-muted animate-pulse rounded" />
              </div>

              {/* Separator */}
              <div className="h-px w-full bg-muted" />

              {/* Items */}
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="size-[60px] bg-muted animate-pulse rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-5 w-24 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
