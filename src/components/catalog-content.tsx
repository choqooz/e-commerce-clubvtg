"use client";

import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import {
  CatalogFilters,
  EMPTY_FILTERS,
  getActiveFilterCount,
  applyFilters,
  type FilterState,
} from "@/components/catalog-filters";
import { CategoryBanner } from "@/components/category-banner";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { CATEGORIES, type Category } from "@/lib/config";
import type { Product } from "@/lib/types";

export function CatalogContent({ initialProducts }: { initialProducts: Product[] }) {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Step 1: filter by category tab
  const categoryProducts =
    activeCategory === "all"
      ? initialProducts
      : initialProducts.filter((p) => p.category === activeCategory);

  // Step 2: apply sidebar filters on top
  const finalProducts = applyFilters(categoryProducts, filters);
  const activeFilterCount = getActiveFilterCount(filters);

  const handleCategoryChange = (cat: Category) => {
    setActiveCategory(cat);
    // Reset subcategory when switching categories (other filters remain)
    if (filters.subcategory) {
      setFilters((prev) => ({ ...prev, subcategory: null }));
    }
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="min-h-screen bg-bone-white font-sans font-normal text-midnight-ink">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Category Banners */}
        <section className="pb-[24px]">
          <CategoryBanner />
        </section>

        {/* Breadcrumb */}
        <div className="px-[18px] py-[18px] md:px-[24px]">
          <nav className="flex flex-wrap items-center gap-[6px] font-mono text-[13px] leading-[1.2]">
            <span className="text-midnight-ink">Inicio</span>
            <ChevronRight size={12} />
            <span>Catálogo</span>
          </nav>
        </div>

        {/* Title & Description */}
        <section className="px-[18px] pb-[42px] md:px-[24px]">
          <h1 className="mb-[24px] font-sans text-[30px] leading-none font-normal md:text-[111px]">
            Catálogo
          </h1>
          <p className="max-w-[400px] font-sans text-[15px] leading-[1.3]">
            Prendas vintage únicas seleccionadas por su calidad, carácter y estilo atemporal.
            Materiales naturales, siluetas relajadas, estilo sin esfuerzo. Cada pieza es única — una
            unidad, un talle.
          </p>
        </section>

        {/* Category Tabs */}
        <section className="px-[18px] pb-[24px] md:px-[24px]">
          <div className="flex items-center gap-[24px] overflow-x-auto border-b border-midnight-ink">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`relative min-h-[36px] shrink-0 whitespace-nowrap px-[6px] py-[6px] font-mono text-[13px] font-normal focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink ${
                  activeCategory === cat.id
                    ? "text-midnight-ink"
                    : "text-midnight-ink hover:underline underline-offset-4"
                }`}
              >
                {cat.label}
                {activeCategory === cat.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[1px] bg-midnight-ink" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Main Content: Sidebar + Grid */}
        <section className="pb-[42px]">
          {/* Toolbar: mobile filter trigger + result count + clear */}
          <div className="mb-[24px] flex flex-wrap items-center justify-between gap-[13px] px-[18px] md:px-[24px]">
            <div className="flex items-center gap-[13px]">
              {/* Mobile filter button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal size={14} />
                    <span>
                      Filtros
                      {activeFilterCount > 0 && ` (${activeFilterCount})`}
                    </span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" aria-describedby={undefined} className="flex flex-col">
                  <SheetHeader>
                    <SheetTitle>Filtros</SheetTitle>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[6px]">
                    <CatalogFilters
                      filters={filters}
                      onFiltersChange={setFilters}
                      categoryProducts={categoryProducts}
                    />
                  </div>
                  <SheetFooter className="border-t border-midnight-ink pt-[13px]">
                    {activeFilterCount > 0 && (
                      <Button variant="outline" onClick={clearFilters} className="w-full">
                        <X size={14} />
                        Limpiar filtros
                      </Button>
                    )}
                    <SheetClose asChild>
                      <Button className="w-full">
                        Ver {finalProducts.length}{" "}
                        {finalProducts.length === 1 ? "prenda" : "prendas"}
                      </Button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {/* Active filter badges (desktop) */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="hidden min-h-[36px] items-center gap-[6px] font-mono text-[13px] font-normal text-midnight-ink hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink lg:flex"
                >
                  <X size={12} />
                  Limpiar filtros ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Results count */}
            <span className="font-mono text-[13px] leading-[1.2]">
              {finalProducts.length}{" "}
              {finalProducts.length === 1 ? "prenda encontrada" : "prendas encontradas"}
            </span>
          </div>

          {/* Layout: sidebar (desktop) + grid */}
          <div className="flex gap-[24px]">
            {/* Desktop Sidebar */}
            <aside className="hidden w-[250px] shrink-0 pl-[24px] lg:block">
              <div className="sticky top-[156px] max-h-[calc(100dvh-180px)] overflow-y-auto pr-[6px] pb-[6px]">
                <CatalogFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  categoryProducts={categoryProducts}
                />
              </div>
            </aside>

            {/* Product Grid */}
            <div className="flex-1 min-w-0">
              {finalProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-[0px] gap-y-[42px] md:grid-cols-3">
                  {finalProducts.map((product, i) => (
                    <div key={product.id} className="min-w-0">
                      <ProductCard product={product} priority={i === 0} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-[13px] px-[18px] py-[42px]">
                  <p className="font-sans text-[15px] leading-[1.3]">
                    No encontramos prendas con estos filtros.
                  </p>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
