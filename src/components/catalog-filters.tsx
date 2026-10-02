"use client";

import { Check, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { COLOR_MAP, FILTER_COLORS, PRICE_BRACKETS, CONDITION_OPTIONS } from "@/lib/constants";
import type { Product } from "@/lib/types";

// ── Filter State ──

export interface FilterState {
  sizes: string[];
  brands: string[];
  colors: string[];
  conditions: string[];
  subcategory: string | null;
  priceBracket: number | null;
}

export const EMPTY_FILTERS: FilterState = {
  sizes: [],
  brands: [],
  colors: [],
  conditions: [],
  subcategory: null,
  priceBracket: null,
};

export function getActiveFilterCount(filters: FilterState): number {
  return (
    filters.sizes.length +
    filters.brands.length +
    filters.colors.length +
    filters.conditions.length +
    (filters.subcategory ? 1 : 0) +
    (filters.priceBracket !== null ? 1 : 0)
  );
}

// ── Filtering Logic ──

export function applyFilters(products: Product[], filters: FilterState): Product[] {
  return products.filter((p) => {
    // Size
    if (filters.sizes.length > 0 && (!p.size || !filters.sizes.includes(p.size))) return false;

    // Brand
    if (filters.brands.length > 0 && (!p.brand || !filters.brands.includes(p.brand))) return false;

    // Color — product color can be comma-separated
    if (filters.colors.length > 0) {
      if (!p.color) return false;
      const productColors = p.color.split(",").map((c) => c.trim().toLowerCase());
      if (!filters.colors.some((fc) => productColors.includes(fc))) return false;
    }

    // Condition
    if (
      filters.conditions.length > 0 &&
      (!p.condition || !filters.conditions.includes(p.condition))
    )
      return false;

    // Subcategory
    if (filters.subcategory && p.subcategory !== filters.subcategory) return false;

    // Price bracket
    if (filters.priceBracket !== null) {
      const b = PRICE_BRACKETS[filters.priceBracket];
      if (p.price < b.min || p.price >= b.max) return false;
    }

    return true;
  });
}

// ── Component ──

interface CatalogFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  /** Products already narrowed by the active category tab */
  categoryProducts: Product[];
}

export function CatalogFilters({
  filters,
  onFiltersChange,
  categoryProducts,
}: CatalogFiltersProps) {
  const [brandSearch, setBrandSearch] = useState("");

  // ── Derive available options from category-scoped products ──

  const availableSizes = [
    ...new Set(categoryProducts.map((p) => p.size).filter(Boolean) as string[]),
  ].sort();

  const brandCounts = categoryProducts.reduce<Record<string, number>>((acc, p) => {
    if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
    return acc;
  }, {});
  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
  const filteredBrands = brandSearch
    ? sortedBrands.filter(([name]) => name.toLowerCase().includes(brandSearch.toLowerCase()))
    : sortedBrands;

  const availableColorKeys = new Set(
    categoryProducts.flatMap((p) =>
      p.color ? p.color.split(",").map((c) => c.trim().toLowerCase()) : [],
    ),
  );

  const availableSubcategories = [
    ...new Set(categoryProducts.map((p) => p.subcategory).filter(Boolean) as string[]),
  ].sort();

  const availableConditions = [
    ...new Set(categoryProducts.map((p) => p.condition).filter(Boolean) as string[]),
  ];

  // ── Toggle helpers ──

  const toggleArray = (key: "sizes" | "brands" | "colors" | "conditions", value: string) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  // ── Visible color entries (only colors present in products) ──
  const visibleColors = FILTER_COLORS.filter((c) => availableColorKeys.has(c.key));

  return (
    <div className="space-y-[24px] font-mono text-[13px] font-normal text-midnight-ink">
      {/* ── Subcategory ── */}
      {availableSubcategories.length > 0 && (
        <>
          <FilterSection title="Subcategoría">
            <div className="flex flex-wrap gap-[6px]">
              {availableSubcategories.map((sub) => (
                <ChipToggle
                  key={sub}
                  active={filters.subcategory === sub}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      subcategory: filters.subcategory === sub ? null : sub,
                    })
                  }
                  className="capitalize"
                >
                  {sub}
                </ChipToggle>
              ))}
            </div>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* ── Size ── */}
      {availableSizes.length > 0 && (
        <>
          <FilterSection title="Talle">
            <div className="flex flex-wrap gap-[6px]">
              {availableSizes.map((size) => (
                <ChipToggle
                  key={size}
                  active={filters.sizes.includes(size)}
                  onClick={() => toggleArray("sizes", size)}
                  className="min-w-[40px]"
                >
                  {size}
                </ChipToggle>
              ))}
            </div>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* ── Color ── */}
      {visibleColors.length > 0 && (
        <>
          <FilterSection title="Color">
            <div className="flex flex-wrap gap-[13px]">
              {visibleColors.map((color) => {
                const hex = COLOR_MAP[color.key];
                const isGradient = hex.includes("gradient");
                const isSelected = filters.colors.includes(color.key);

                return (
                  <button
                    key={color.key}
                    type="button"
                    onClick={() => toggleArray("colors", color.key)}
                    className="flex min-h-[36px] min-w-[36px] flex-col items-center gap-[6px] rounded-none px-[4px] py-[4px] font-mono text-[13px] font-normal text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-[2px]"
                    aria-label={color.name}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="relative size-[28px] rounded-none border border-midnight-ink"
                      style={isGradient ? { background: hex } : { backgroundColor: hex }}
                    >
                      {isSelected && (
                        <Check
                          size={14}
                          className="absolute inset-0 m-auto bg-bone-white text-midnight-ink"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <span className="font-mono text-[13px] font-normal">{color.name}</span>
                  </button>
                );
              })}
            </div>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* ── Price Range ── */}
      <FilterSection title="Precio">
        <div className="flex flex-col gap-[6px]">
          {PRICE_BRACKETS.map((bracket, i) => (
            <ChipToggle
              key={i}
              active={filters.priceBracket === i}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  priceBracket: filters.priceBracket === i ? null : i,
                })
              }
              className="justify-start text-left"
            >
              {bracket.label}
            </ChipToggle>
          ))}
        </div>
      </FilterSection>

      {/* ── Condition ── */}
      {availableConditions.length > 0 && (
        <>
          <Separator />
          <FilterSection title="Estado">
            <div className="flex flex-wrap gap-[6px]">
              {CONDITION_OPTIONS.filter((c) => availableConditions.includes(c)).map((cond) => (
                <ChipToggle
                  key={cond}
                  active={filters.conditions.includes(cond)}
                  onClick={() => toggleArray("conditions", cond)}
                >
                  {cond}
                </ChipToggle>
              ))}
            </div>
          </FilterSection>
        </>
      )}

      {/* ── Brand ── */}
      {sortedBrands.length > 0 && (
        <>
          <Separator />
          <FilterSection title="Marca">
            {sortedBrands.length > 6 && (
              <div className="relative mb-[13px]">
                <Search
                  size={14}
                  className="absolute left-[10px] top-1/2 -translate-y-1/2 text-midnight-ink"
                />
                <Input
                  placeholder="Buscar marca..."
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  className="h-[36px] pl-[30px] font-mono text-[16px] font-normal md:text-[13px]"
                />
              </div>
            )}
            <div className="flex max-h-[208px] flex-col gap-[2px] overflow-y-auto p-[2px]">
              {filteredBrands.map(([brand, count]) => {
                const selected = filters.brands.includes(brand);
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => toggleArray("brands", brand)}
                    aria-pressed={selected}
                    className={`flex min-h-[36px] items-center justify-between gap-[13px] rounded-none px-[6px] py-[2px] font-mono text-[13px] font-normal text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-[0px] ${
                      selected ? "bg-warm-sand" : "bg-bone-white hover:bg-warm-sand"
                    }`}
                  >
                    <span className="flex items-center gap-[6px]">
                      <span
                        className={`flex size-[14px] shrink-0 items-center justify-center rounded-none border border-midnight-ink ${
                          selected ? "bg-midnight-ink" : "bg-bone-white"
                        }`}
                      >
                        {selected && (
                          <Check size={10} className="text-bone-white" strokeWidth={3} />
                        )}
                      </span>
                      {brand}
                    </span>
                    <span className="font-mono text-[13px] font-normal tabular-nums">{count}</span>
                  </button>
                );
              })}
              {filteredBrands.length === 0 && (
                <p className="py-[13px] text-center font-mono text-[13px] font-normal">
                  Sin resultados
                </p>
              )}
            </div>
          </FilterSection>
        </>
      )}
    </div>
  );
}

// ── Reusable Primitives ──

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-[13px] font-mono text-[13px] font-normal uppercase">{title}</h3>
      {children}
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[28px] rounded-none border border-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-3px] ${
        active
          ? "bg-midnight-ink text-bone-white focus-visible:outline-bone-white"
          : "bg-bone-white text-midnight-ink hover:bg-warm-sand focus-visible:outline-midnight-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}
