export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="h-16 border-b bg-background" />

      {/* Breadcrumb skeleton */}
      <div className="container mx-auto px-6 py-4">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>

      <div className="container mx-auto px-6 pb-16">
        <div className="max-w-3xl mx-auto space-y-10">
          {/* Header + balance */}
          <div className="flex flex-col items-center space-y-3">
            <div className="size-14 bg-muted animate-pulse rounded-full" />
            <div className="h-7 w-32 bg-muted animate-pulse rounded" />
            <div className="h-10 w-36 bg-muted animate-pulse rounded-lg" />
          </div>

          {/* Pack cards heading */}
          <div className="space-y-4">
            <div className="h-6 w-40 bg-muted animate-pulse rounded mx-auto" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded mx-auto" />

            {/* 3 pack card skeletons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-6 space-y-4"
                >
                  <div className="h-5 w-20 bg-muted animate-pulse rounded mx-auto" />
                  <div className="h-10 w-16 bg-muted animate-pulse rounded mx-auto" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded mx-auto" />
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* FAQ skeleton */}
          <div className="rounded-lg border bg-muted/30 p-6 space-y-3">
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
