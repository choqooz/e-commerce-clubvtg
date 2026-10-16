import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COLOR_MAP, FILTER_COLORS, PRICE_BRACKETS } from "@/lib/constants";
import { CATEGORIES, formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";
import { ProductCard } from "./product-card";
import { CategoryBanner } from "./category-banner";
import {
  CatalogFilters,
  EMPTY_FILTERS,
  applyFilters,
  getActiveFilterCount,
  type FilterState,
} from "./catalog-filters";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "one",
    title: "Campera vintage",
    slug: "campera-vintage",
    description: null,
    price: 30000,
    size: "M",
    color: "Azul, BLANCO",
    category: "outerwear",
    image_urls: [],
    status: "available",
    reserved_at: null,
    created_at: "",
    updated_at: "",
    subcategory: "camperas",
    brand: "Vintage",
    condition: "Excelente",
    measurements: null,
    product_type_id: null,
    product_subtype_id: null,
    ...overrides,
  };
}

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...EMPTY_FILTERS,
  ...overrides,
});
const buttons = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
const classTokens = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(" "));
function renderFilters(products: Product[], state = EMPTY_FILTERS) {
  return renderToStaticMarkup(
    <CatalogFilters categoryProducts={products} filters={state} onFiltersChange={() => {}} />,
  );
}

function expectFlat(html: string) {
  expect(classTokens(html).join(" ")).not.toMatch(
    /shadow|blur|scale-|transition|rounded-(?!none)|font-(?:light|medium|semibold|bold)|text-green|bg-green/,
  );
}

describe("Redesigned UI catalog surfaces", () => {
  it.each([
    { label: "regular", values: {}, price: 30000, promotion: false },
    {
      label: "promotion",
      values: { current_price: 24000, promotion_percent: 20 },
      price: 24000,
      promotion: true,
    },
    { label: "zero current price", values: { current_price: 0 }, price: 0, promotion: false },
  ])("preserves $label price, slug link and metadata", ({ values, price, promotion }) => {
    const html = renderToStaticMarkup(<ProductCard product={product(values)} />);
    expect(html).toContain('href="/product/campera-vintage"');
    expect(html).toContain("Campera vintage</h3>");
    expect(html).toContain(formatPrice(price));
    expect(html).toContain("Talle M • Azul, BLANCO");
    expect(html.includes("line-through")).toBe(promotion);
    expect(html.includes("-20%")).toBe(promotion);
    if (promotion) expect(html).toContain(formatPrice(30000));
    expect(html).not.toContain("Hasta ");
    expect(classTokens(html)).toEqual(
      expect.arrayContaining([
        "font-sans",
        "text-[15px]",
        "font-mono",
        "text-[13px]",
        "font-normal",
        "focus-visible:outline-2",
      ]),
    );
    expectFlat(html);
  });

  it("keeps Argentine end-date localization and timezone across UTC midnight", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={product({ promotion_ends_at: "2026-01-02T02:30:00Z" })} />,
    );
    expect(html).toContain("Hasta 1/1/26, 23:30:00");
  });

  it.each([false, true])(
    "preserves fill image, first URL, alt, sizes and priority=%s without motion",
    (priority) => {
      const html = renderToStaticMarkup(
        <ProductCard
          priority={priority}
          product={product({ image_urls: ["/first.jpg", "/second.jpg"] })}
        />,
      );
      expect(html).toContain('data-nimg="fill"');
      expect(html).toContain('alt="Campera vintage"');
      expect(html).toContain("%2Ffirst.jpg");
      expect(html).not.toContain("second.jpg");
      expect(html).toContain('sizes="(min-width: 768px) 25vw, 50vw"');
      expect(html.includes('rel="preload"')).toBe(priority);
      expect(html).not.toContain("product-card-image");
      expect(classTokens(html)).toEqual(
        expect.arrayContaining([
          "relative",
          "w-full",
          "aspect-[4/5]",
          "object-cover",
          "bg-secondary",
        ]),
      );
      expectFlat(html);
    },
  );

  it("retains category and unique-size fallbacks without inventing an image", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={product({ size: null, color: null })} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("outerwear</span>");
    expect(html).toContain("Talle Único</span>");
    expect(html).not.toContain(" • ");
  });

  it.each([
    ["available", null],
    ["reserved", "Reservado"],
    ["sold", "Vendido"],
    ["archived", "No disponible"],
  ] as const)(
    "keeps real %s status and product link without claiming cover stock",
    (status, label) => {
      const html = renderToStaticMarkup(<ProductCard product={product({ status })} />);
      expect(html).toContain('href="/product/campera-vintage"');
      if (label) expect(html).toContain(label);
      else expect(html).not.toMatch(/Reservado|Vendido|No disponible|En stock/);
    },
  );

  it("renders all six category entry actions with flat, regular-type surfaces", () => {
    const html = renderToStaticMarkup(
      <CategoryBanner initialProducts={[]} onCategoryChange={() => {}} />,
    );
    for (const category of CATEGORIES.filter((category) => category.id !== "all"))
      expect(html).toContain(`aria-label="Ver ${category.label} en el catálogo"`);
    expect(buttons(html)).toHaveLength(6);
    expect(html).not.toContain("Ver Todo en el catálogo");
    expect(classTokens(html)).toEqual(
      expect.arrayContaining([
        "md:text-[30px]",
        "font-sans",
        "font-normal",
        "font-mono",
        "text-[13px]",
        "bg-warm-sand",
        "md:grid-cols-4",
        "gap-[10px]",
      ]),
    );
    expectFlat(html);
  });
});

describe("Catalog filter contract", () => {
  it.each([
    [0, 0],
    [14999, 0],
    [15000, 1],
    [29999, 1],
    [30000, 2],
    [49999, 2],
    [50000, 3],
    [999999, 3],
  ])("keeps inclusive lower/exclusive upper brackets for ARS %s", (price, bracket) => {
    const item = product({ price, current_price: 1 });
    PRICE_BRACKETS.forEach((_, index) => {
      expect(applyFilters([item], filters({ priceBracket: index }))).toEqual(
        index === bracket ? [item] : [],
      );
    });
  });

  it.each([
    { sizes: ["M", "L"] },
    { brands: ["Vintage", "Other"] },
    { colors: ["blanco", "rojo"] },
    { conditions: ["Excelente", "Nuevo"] },
    { subcategory: "camperas" },
    {
      sizes: ["M"],
      brands: ["Vintage"],
      colors: ["azul"],
      conditions: ["Excelente"],
      subcategory: "camperas",
      priceBracket: 2,
    },
  ])("retains multiselect OR within a dimension and AND between dimensions: %j", (state) => {
    const matching = product();
    const missing = product({
      size: null,
      brand: null,
      color: null,
      condition: null,
      subcategory: null,
    });
    expect(applyFilters([matching, missing], filters(state))).toEqual([matching]);
    expect(applyFilters([matching], filters({ ...state, sizes: ["XS"] }))).toEqual([]);
  });

  it.each([
    [filters(), 0],
    [filters({ priceBracket: 0 }), 1],
    [
      filters({
        sizes: ["M", "L"],
        brands: ["Vintage"],
        colors: ["azul", "blanco"],
        conditions: ["Nuevo"],
        subcategory: "camperas",
        priceBracket: 2,
      }),
      8,
    ],
  ])("counts each selected value, including bracket zero", (state, count) => {
    expect(getActiveFilterCount(state as FilterState)).toBe(count);
  });

  it("keeps empty defaults and does not mutate helper inputs", () => {
    const products = [product()];
    const before = JSON.stringify({ products, state: EMPTY_FILTERS });
    expect(applyFilters(products, EMPTY_FILTERS)).toEqual(products);
    expect(EMPTY_FILTERS).toEqual({
      sizes: [],
      brands: [],
      colors: [],
      conditions: [],
      subcategory: null,
      priceBracket: null,
    });
    expect(JSON.stringify({ products, state: EMPTY_FILTERS })).toBe(before);
    expect(renderFilters([])).toContain("Precio");
    expect(renderFilters([])).not.toMatch(/Subcategoría|Talle|Color|Estado|Marca/);
  });

  it.each([false, true])(
    "keeps truthful square swatches and accessible pressed state=%s",
    (selected) => {
      const colors = FILTER_COLORS.map((color) => color.key);
      const html = renderFilters(
        [product({ color: colors.join(", ") })],
        filters({ colors: selected ? colors : [] }),
      );
      FILTER_COLORS.forEach(({ key, name }) => {
        const button = buttons(html).find((markup) => markup.includes(`aria-label="${name}"`))!;
        expect(button).toContain(`aria-pressed="${selected}"`);
        expect(button).toContain('type="button"');
        expect(button).toContain(COLOR_MAP[key]);
        expect(classTokens(button)).toEqual(
          expect.arrayContaining([
            "min-h-[36px]",
            "min-w-[36px]",
            "size-[28px]",
            "border",
            "border-midnight-ink",
            "focus-visible:outline-2",
          ]),
        );
        expect(button.includes("lucide-check")).toBe(selected);
        if (selected) expect(button).toContain("bg-bone-white text-midnight-ink");
      });
      expectFlat(html);
    },
  );

  it.each([false, true])(
    "derives scoped choices/counts and neutral active chips/brands=%s",
    (active) => {
      const state = active
        ? filters({
            sizes: ["M"],
            brands: ["Vintage"],
            subcategory: "camperas",
            conditions: ["Excelente"],
            priceBracket: 0,
          })
        : EMPTY_FILTERS;
      const html = renderFilters([product(), product({ size: "L" })], state);
      for (const label of ["camperas", "M", "Excelente", "Hasta $15.000", "Vintage"]) {
        const button = buttons(html).find((markup) => markup.includes(`>${label}<`))!;
        expect(button).toContain(`aria-pressed="${active}"`);
        expect(button).toContain('type="button"');
        expect(classTokens(button)).toEqual(
          expect.arrayContaining([
            "font-mono",
            "text-[13px]",
            "font-normal",
            "focus-visible:outline-2",
          ]),
        );
        expect(button).toContain(
          active
            ? label === "Vintage"
              ? "bg-warm-sand"
              : "bg-midnight-ink text-bone-white"
            : "bg-bone-white",
        );
      }
      expect(html).toMatch(/tabular-nums">2<\/span>/);
      expect(html).not.toContain('aria-label="Rojo"');
      expect(html).not.toContain("Buscar marca...");
      expectFlat(html);
    },
  );

  it("shows a full-height brand search only above six brands and preserves list bounds", () => {
    const products = Array.from({ length: 7 }, (_, index) => product({ brand: `Brand ${index}` }));
    expect(renderFilters(products.slice(0, 6))).not.toContain("Buscar marca...");
    const html = renderFilters(products);
    expect(html).toContain('placeholder="Buscar marca..."');
    const input = html.match(/<input\b[^>]*>/)![0];
    expect(classTokens(input)).toEqual(
      expect.arrayContaining(["h-[36px]", "pl-[30px]", "font-mono", "md:text-[13px]"]),
    );
    expect(classTokens(html)).toContain("max-h-[208px]");
    expectFlat(html);
  });
});
