"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  COLOR_MAP,
  FILTER_COLORS,
  PRICE_BRACKETS,
  CONDITION_OPTIONS,
} from "@/lib/constants";
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

export function applyFilters(
  products: Product[],
  filters: FilterState
): Product[] {
  return products.filter((p) => {
    // Size
    if (
      filters.sizes.length > 0 &&
      (!p.size || !filters.sizes.includes(p.size))
    )
      return false;

    // Brand
    if (
      filters.brands.length > 0 &&
      (!p.brand || !filters.brands.includes(p.brand))
    )
      return false;

    // Color — product color can be comma-separated
    if (filters.colors.length > 0) {
      if (!p.color) return false;
      const productColors = p.color
        .split(",")
        .map((c) => c.trim().toLowerCase());
      if (!filters.colors.some((fc) => productColors.includes(fc)))
        return false;
    }

    // Condition
    if (
      filters.conditions.length > 0 &&
      (!p.condition || !filters.conditions.includes(p.condition))
    )
      return false;

    // Subcategory
    if (filters.subcategory && p.subcategory !== filters.subcategory)
      return false;

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
    ...new Set(
      categoryProducts.map((p) => p.size).filter(Boolean) as string[]
    ),
  ].sort();

  const brandCounts = categoryProducts.reduce<Record<string, number>>(
    (acc, p) => {
      if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1;
      return acc;
    },
    {}
  );
  const sortedBrands = Object.entries(brandCounts).sort(
    (a, b) => b[1] - a[1]
  );
  const filteredBrands = brandSearch
    ? sortedBrands.filter(([name]) =>
        name.toLowerCase().includes(brandSearch.toLowerCase())
      )
    : sortedBrands;

  const availableColorKeys = new Set(
    categoryProducts.flatMap((p) =>
      p.color ? p.color.split(",").map((c) => c.trim().toLowerCase()) : []
    )
  );

  const availableSubcategories = [
    ...new Set(
      categoryProducts.map((p) => p.subcategory).filter(Boolean) as string[]
    ),
  ].sort();

  const availableConditions = [
    ...new Set(
      categoryProducts.map((p) => p.condition).filter(Boolean) as string[]
    ),
  ];

  // ── Toggle helpers ──

  const toggleArray = (
    key: "sizes" | "brands" | "colors" | "conditions",
    value: string
  ) => {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  // ── Visible color entries (only colors present in products) ──
  const visibleColors = FILTER_COLORS.filter((c) =>
    availableColorKeys.has(c.key)
  );

  return (
    <div className="space-y-6">
      {/* ── Subcategory ── */}
      {availableSubcategories.length > 0 && (
        <>
          <FilterSection title="Subcategoría">
            <div className="flex flex-wrap gap-1.5">
              {availableSubcategories.map((sub) => (
                <ChipToggle
                  key={sub}
                  active={filters.subcategory === sub}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      subcategory:
                        filters.subcategory === sub ? null : sub,
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
            <div className="flex flex-wrap gap-1.5">
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
            <div className="flex flex-wrap gap-2.5">
              {visibleColors.map((color) => {
                const hex = COLOR_MAP[color.key];
                const isGradient = hex.includes("gradient");
                const isSelected = filters.colors.includes(color.key);
                const needsDarkCheck =
                  color.key === "blanco" || color.key === "amarillo";

                return (
                  <button
                    key={color.key}
                    onClick={() => toggleArray("colors", color.key)}
                    className="group/color flex flex-col items-center gap-1"
                    aria-label={color.name}
                  >
                    <span
                      className={`relative w-7 h-7 rounded-full border-2 transition-all duration-200 ${
                        isSelected
                          ? "border-foreground scale-110 ring-2 ring-foreground ring-offset-2"
                          : color.key === "blanco"
                            ? "border-border hover:border-foreground/50 hover:ring-2 hover:ring-offset-2 hover:ring-foreground/30"
                            : "border-transparent hover:scale-105 hover:ring-2 hover:ring-offset-2 hover:ring-foreground/30"
                      }`}
                      style={
                        isGradient
                          ? { background: hex }
                          : { backgroundColor: hex }
                      }
                    >
                      {isSelected && (
                        <Check
                          size={14}
                          className={`absolute inset-0 m-auto ${
                            needsDarkCheck
                              ? "text-foreground"
                              : "text-white"
                          }`}
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground group-hover/color:text-foreground transition-colors">
                      {color.name}
                    </span>
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
        <div className="flex flex-col gap-1.5">
          {PRICE_BRACKETS.map((bracket, i) => (
            <ChipToggle
              key={i}
              active={filters.priceBracket === i}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  priceBracket:
                    filters.priceBracket === i ? null : i,
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
            <div className="flex flex-wrap gap-1.5">
              {CONDITION_OPTIONS.filter((c) =>
                availableConditions.includes(c)
              ).map((cond) => (
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
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder="Buscar marca..."
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  className="pl-8 h-7 text-xs"
                />
              </div>
            )}
            <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
              {filteredBrands.map(([brand, count]) => {
                const selected = filters.brands.includes(brand);
                return (
                  <button
                    key={brand}
                    onClick={() => toggleArray("brands", brand)}
                    className={`flex items-center justify-between px-2 py-1.5 text-xs font-sans transition-colors ${
                      selected
                        ? "bg-foreground/5 text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 ${
                          selected
                            ? "border-foreground bg-foreground"
                            : "border-border"
                        }`}
                      >
                        {selected && (
                          <Check
                            size={10}
                            className="text-background"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      {brand}
                    </span>
                    <span className="text-muted-foreground/60 tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
              {filteredBrands.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">
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

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest font-sans font-medium mb-3">
        {title}
      </h3>
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
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-sans tracking-wide border transition-all duration-200 ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground hover:bg-foreground/5"
      } ${className}`}
    >
      {children}
    </button>
  );
}
