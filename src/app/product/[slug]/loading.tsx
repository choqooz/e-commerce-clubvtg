import { CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  StorefrontContentTransition,
  StorefrontTransition,
} from "@/components/storefront-transition";

/** The fallback and resolved page are alternatives, never nested named boundaries. */
export default function Loading() {
  return (
    <StorefrontTransition>
      <div className="min-h-screen bg-bone-white font-sans font-normal text-midnight-ink">
        <SiteHeader />
        <CartDrawer />
        <StorefrontContentTransition>
          <main className="container mx-auto px-4 py-8" aria-busy="true">
            <p role="status" className="sr-only">
              Cargando prenda…
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              {/* Image skeleton */}
              <div className="aspect-[3/4] bg-muted animate-pulse motion-reduce:animate-none rounded" />

              {/* Product info skeleton */}
              <div className="space-y-6 py-4">
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                  <div className="h-8 w-3/4 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                  <div className="h-6 w-32 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted animate-pulse motion-reduce:animate-none rounded" />
                  <div className="h-4 w-full bg-muted animate-pulse motion-reduce:animate-none rounded" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                </div>

                <div className="h-12 w-full bg-muted animate-pulse motion-reduce:animate-none rounded" />
              </div>
            </div>

            {/* Related products skeleton */}
            <div className="mt-16 space-y-6">
              <div className="h-6 w-48 bg-muted animate-pulse motion-reduce:animate-none rounded" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-[4/5] bg-muted animate-pulse motion-reduce:animate-none rounded" />
                    <div className="h-4 w-3/4 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                    <div className="h-4 w-1/4 bg-muted animate-pulse motion-reduce:animate-none rounded" />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </StorefrontContentTransition>
        <SiteFooter />
      </div>
    </StorefrontTransition>
  );
}
