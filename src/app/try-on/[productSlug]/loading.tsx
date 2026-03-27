export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="h-16 border-b bg-background" />

      {/* Breadcrumb skeleton */}
      <div className="container mx-auto px-6 py-4">
        <div className="h-4 w-56 bg-muted animate-pulse rounded" />
      </div>

      {/* Main content */}
      <div className="container mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Product image */}
          <div className="space-y-6">
            <div className="aspect-[3/4] w-full bg-muted animate-pulse rounded-lg" />
            <div className="space-y-2">
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-6 w-48 bg-muted animate-pulse rounded" />
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
            </div>
          </div>

          {/* Right: Upload area */}
          <div className="space-y-6">
            {/* Credit balance skeleton */}
            <div className="h-10 w-36 bg-muted animate-pulse rounded-lg" />

            {/* Upload zone skeleton */}
            <div className="space-y-4">
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-72 bg-muted animate-pulse rounded" />
              <div className="aspect-square max-h-80 w-full bg-muted animate-pulse rounded-lg border-2 border-dashed border-muted-foreground/20" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded mx-auto" />
            </div>

            {/* Back link skeleton */}
            <div className="pt-4 border-t">
              <div className="h-8 w-36 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
