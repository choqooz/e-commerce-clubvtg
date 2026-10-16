"use client";

import { ArrowLeft, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import {
  CatalogFilters,
  EMPTY_FILTERS,
  getActiveFilterCount,
  applyFilters,
  type FilterState,
} from "@/components/catalog-filters";
import {
  collectionSnapshot,
  homeSnapshot,
  navigateCollection,
  subscribeToCollection,
  normalizePublicTypeNames,
  isCatalogSelection,
  type CatalogSnapshot,
} from "@/components/catalog-url-state";
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

export function CatalogContent({
  initialProducts,
  publicTypeNames = [],
  typesLoadError = false,
}: {
  initialProducts: Product[];
  publicTypeNames?: string[];
  typesLoadError?: boolean;
}) {
  const names = normalizePublicTypeNames(publicTypeNames);
  const [previousCategory, setPreviousCategory] = useState<CatalogSnapshot>("all");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const snapshot = useSyncExternalStore(
    subscribeToCollection,
    () => collectionSnapshot(names),
    homeSnapshot,
  );
  const isCollection = snapshot !== "home";
  const selection = isCollection ? snapshot : "all";
  const activeCategory = selection.startsWith("type:")
    ? selection.slice(5)
    : selection.startsWith("legacy:")
      ? selection.slice(7)
      : "all";
  const previousCollection = useRef(false);

  // Adjust before children render, including URL/history changes, not in a delayed effect.
  if (selection !== previousCategory) {
    setPreviousCategory(selection);
    if (filters.subcategory) setFilters((prev) => ({ ...prev, subcategory: null }));
  }

  useEffect(() => {
    // Do not steal focus on an ordinary home visit. Hash navigation focuses the new view.
    const wasCollection = previousCollection.current;
    previousCollection.current = isCollection;
    if (!isCollection && !wasCollection) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(isCollection ? "catalog" : "category-entry");
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCollection]);

  const categoryProducts =
    selection === "all"
      ? initialProducts
      : initialProducts.filter((p) => p.category === activeCategory);
  const finalProducts = applyFilters(categoryProducts, filters);
  const activeFilterCount = getActiveFilterCount(filters);

  const handleCategoryChange = (cat: CatalogSnapshot) => {
    if (!isCatalogSelection(cat, names)) return;
    // Even reselecting the same category clears only subcategory, never the other dimensions.
    if (filters.subcategory) {
      setFilters((prev) => ({ ...prev, subcategory: null }));
    }
    navigateCollection(cat, names);
  };
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="min-h-screen bg-bone-white font-sans font-normal text-midnight-ink">
      <SiteHeader />
      <CartDrawer />
      <main>
        {!isCollection && (
          <section
            id="category-entry"
            aria-label="Explorar por categoría"
            tabIndex={-1}
            className="w-full scroll-mt-[156px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-midnight-ink"
          >
            <h1 className="sr-only">Colecciones clubvtg</h1>
            <CategoryBanner
              initialProducts={initialProducts}
              onCategoryChange={(cat: Category) =>
                handleCategoryChange(
                  cat === "all" ? "all" : names.includes(cat) ? `type:${cat}` : `legacy:${cat}`,
                )
              }
            />
            <div className="flex justify-center px-[18px] py-[24px]">
              <button
                type="button"
                aria-controls="catalog"
                onClick={() => handleCategoryChange("all")}
                className="min-h-[36px] font-mono text-[13px] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
              >
                Ver todas las prendas
              </button>
            </div>
          </section>
        )}

        {/* The controlled collection target exists even while its contents are not mounted. */}
        <section
          id="catalog"
          aria-label="Catálogo de prendas"
          hidden={!isCollection}
          tabIndex={-1}
          className="w-full scroll-mt-[156px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-midnight-ink"
        >
          {isCollection && (
            <>
              <h1 className="sr-only">Catálogo de prendas</h1>
              <div className="flex flex-wrap items-center justify-between gap-[13px] px-[18px] py-[18px] font-mono text-[13px] md:px-[24px]">
                <button
                  type="button"
                  onClick={() => navigateCollection("home")}
                  className="flex min-h-[36px] items-center gap-[6px] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Volver al inicio
                </button>
                <div className="flex min-w-0 flex-wrap items-center gap-[13px]">
                  <label htmlFor="collection-category" className="sr-only">
                    Categoría
                  </label>
                  <select
                    id="collection-category"
                    value={selection}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value.startsWith("legacy:") || value === selection) {
                        handleCategoryChange(value as CatalogSnapshot);
                      }
                    }}
                    className="min-h-[36px] min-w-0 max-w-full rounded-none border-0 bg-bone-white py-[6px] font-mono text-[13px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink"
                  >
                    <option value="all">Todo</option>
                    {names.map((name) => (
                      <option key={name} value={`type:${name}`}>
                        {name}
                      </option>
                    ))}
                    {selection.startsWith("legacy:") && (
                      <optgroup label="Categoría de inicio">
                        <option value={selection}>
                          {CATEGORIES.find((category) => category.id === activeCategory)?.label}
                        </option>
                      </optgroup>
                    )}
                  </select>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <SlidersHorizontal size={14} aria-hidden="true" />
                        Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      aria-describedby={undefined}
                      className="flex flex-col"
                    >
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
                </div>
                <div className="flex flex-wrap items-center gap-[13px]">
                  <span role="status">
                    {finalProducts.length}{" "}
                    {finalProducts.length === 1 ? "prenda encontrada" : "prendas encontradas"}
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="flex min-h-[36px] items-center gap-[6px] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
                    >
                      <X size={12} aria-hidden="true" />
                      Limpiar filtros ({activeFilterCount})
                    </button>
                  )}
                </div>
              </div>
              {typesLoadError ? (
                <p role="status">No pudimos cargar las categorías. Intentá de nuevo más tarde.</p>
              ) : (
                names.length === 0 && <p role="status">No hay categorías creadas disponibles.</p>
              )}
              {finalProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-[10px] gap-y-[24px] pb-[42px] md:grid-cols-4">
                  {finalProducts.map((product, i) => (
                    <ProductCard key={product.id} product={product} priority={i === 0} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-[13px] px-[18px] py-[42px] font-mono text-[13px]">
                  <p>No encontramos prendas con estos filtros.</p>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
