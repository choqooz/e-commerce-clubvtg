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
        <div className="max-w-2xl mx-auto space-y-10">
          {/* Avatar + name + email */}
          <div className="flex flex-col items-center space-y-4">
            <div className="size-24 bg-muted animate-pulse rounded-full" />
            <div className="space-y-2 flex flex-col items-center">
              <div className="h-7 w-40 bg-muted animate-pulse rounded" />
              <div className="h-4 w-52 bg-muted animate-pulse rounded" />
              <div className="h-5 w-28 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-9 w-40 bg-muted animate-pulse rounded" />
          </div>

          {/* Separator */}
          <div className="h-px w-full bg-border" />

          {/* Credits section */}
          <div className="flex flex-col items-center space-y-4">
            <div className="size-12 bg-muted animate-pulse rounded-full" />
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-56 bg-muted animate-pulse rounded" />
            <div className="h-10 w-44 bg-muted animate-pulse rounded" />
          </div>

          {/* Separator */}
          <div className="h-px w-full bg-border" />

          {/* Quick links */}
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 w-full bg-muted animate-pulse rounded border border-border"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
