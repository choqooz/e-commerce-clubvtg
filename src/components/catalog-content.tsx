"use client";

import { useState } from "react";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CategoryBanner from "@/components/category-banner";
import ProductCard from "@/components/product-card";
import CartDrawer from "@/components/cart-drawer";
import {
  CatalogFilters,
  EMPTY_FILTERS,
  getActiveFilterCount,
  applyFilters,
  type FilterState,
} from "@/components/catalog-filters";
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

export function CatalogContent({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Category Banners */}
        <section className="container mx-auto px-6 pt-8 pb-6">
          <CategoryBanner />
        </section>

        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <span className="text-foreground">Inicio</span>
            <ChevronRight size={12} />
            <span>Catálogo</span>
          </nav>
        </div>

        {/* Title & Description */}
        <section className="container mx-auto px-6 pb-8">
          <h1 className="font-heading text-4xl md:text-5xl font-light mb-4">
            Catálogo
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed font-sans">
            Prendas vintage únicas seleccionadas por su calidad, carácter y
            estilo atemporal. Materiales naturales, siluetas relajadas, estilo
            sin esfuerzo. Cada pieza es única — una unidad, un talle.
          </p>
        </section>

        {/* Category Tabs */}
        <section className="container mx-auto px-6 pb-6">
          <div className="flex items-center gap-6 border-b border-border overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`pb-3 text-sm tracking-wide font-sans transition-colors relative whitespace-nowrap ${
                  activeCategory === cat.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label}
                {activeCategory === cat.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Main Content: Sidebar + Grid */}
        <section className="container mx-auto px-6 pb-16">
          {/* Toolbar: mobile filter trigger + result count + clear */}
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-3">
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
                <SheetContent side="right" className="flex flex-col">
                  <SheetHeader>
                    <SheetTitle>Filtros</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-4 py-2">
                    <CatalogFilters
                      filters={filters}
                      onFiltersChange={setFilters}
                      categoryProducts={categoryProducts}
                    />
                  </div>
                  <SheetFooter className="border-t border-border pt-3">
                    {activeFilterCount > 0 && (
                      <Button
                        variant="outline"
                        onClick={clearFilters}
                        className="w-full"
                      >
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
                  className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-sans transition-colors"
                >
                  <X size={12} />
                  Limpiar filtros ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Results count */}
            <span className="text-xs text-muted-foreground font-sans whitespace-nowrap">
              {finalProducts.length}{" "}
              {finalProducts.length === 1
                ? "prenda encontrada"
                : "prendas encontradas"}
            </span>
          </div>

          {/* Layout: sidebar (desktop) + grid */}
          <div className="flex gap-10">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:block w-[250px] shrink-0">
              <div className="sticky top-6">
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-10">
                  {finalProducts.map((product, i) => (
                    <div
                      key={product.id}
                      className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={{
                        animationDelay: `${i * 80}ms`,
                        animationFillMode: "backwards",
                      }}
                    >
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="text-muted-foreground font-sans text-sm">
                    No encontramos prendas con estos filtros.
                  </p>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                    >
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
