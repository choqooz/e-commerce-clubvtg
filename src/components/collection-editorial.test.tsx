import { readFileSync } from "node:fs";
import Image from "next/image";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { CollectionEditorial } from "./collection-editorial";
import { ProductCard } from "./product-card";

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const nodes = (tree: ReactNode): Element[] =>
  Children.toArray(tree).flatMap((child) =>
    isValidElement(child) ? [child as Element, ...nodes((child as Element).props.children)] : [],
  );
const product = (index: number, overrides: Partial<Product> = {}): Product => ({
  id: `item-${index}`,
  slug: `prenda-${index}`,
  title: `Prenda ${index}`,
  description: null,
  price: 10000,
  size: "M",
  color: "Azul",
  category: "Abrigos",
  subcategory: "Camperas",
  brand: null,
  condition: "Bueno",
  measurements: null,
  image_urls: [`/photo-${index}.jpg`],
  status: "available",
  reserved_at: null,
  created_at: "",
  updated_at: "",
  product_type_id: null,
  product_subtype_id: null,
  ...overrides,
});
const render = (products: Product[], query = "", categoryName = "Abrigos") =>
  CollectionEditorial({ products, query, categoryName });
const hero = (tree: ReactNode) => nodes(tree).find((node) => "data-collection-hero" in node.props);
const cards = (tree: ReactNode) => nodes(tree).filter((node) => node.type === ProductCard);

describe("Editorial collection and search", () => {
  it.each([0, 1, 4, 7])("keeps every card exactly once in source order for %i results", (count) => {
    const products = Array.from({ length: count }, (_, index) => product(index));
    const before = JSON.stringify(products);
    const tree = render(products);
    expect(cards(tree).map((card) => card.props.product)).toEqual(products);
    expect(cards(tree).map((card) => card.key)).toHaveLength(
      new Set(products.map((p) => p.id)).size,
    );
    expect(cards(tree).map((card) => card.props.priority)).toEqual(
      products.map((_, index) => index === 0),
    );
    const markup = renderToStaticMarkup(tree);
    expect(markup.match(/class="product-card /g) ?? []).toHaveLength(count);
    for (const item of products)
      expect(markup.match(new RegExp(`href="/product/${item.slug}"`, "g"))).toHaveLength(1);
    expect(Boolean(hero(tree))).toBe(count > 0);
    expect(nodes(tree).filter((node) => node.type === "h1")).toHaveLength(1);
    expect(JSON.stringify(products)).toBe(before);
  });

  it("uses the first valid selected photo decoratively without consuming its product", () => {
    const first = product(0, {
      image_urls: ["", " ", "bad-url", "javascript:alert(1)", "//example.com/a.jpg"],
    });
    const second = product(1, { image_urls: [" /selected.jpg ", "/second-angle.jpg"] });
    const tree = render([first, second, product(2)]);
    expect(hero(tree)?.props["aria-hidden"]).toBe("true");
    const image = nodes(hero(tree)).find((node) => node.type === Image)!;
    expect(image.props).toMatchObject({
      src: "/selected.jpg",
      alt: "",
      fill: true,
      preload: true,
      sizes: "(min-width: 1024px) 50vw, 100vw",
    });
    expect(cards(tree).map((card) => card.props.product)).toEqual([first, second, product(2)]);
    expect(nodes(hero(tree)).filter((node) => node.props.href)).toHaveLength(0);
    expect(nodes(hero(tree)).find((node) => node.type === "span")?.props.children).toBe("Abrigos");
  });

  it("does not invent a hero or an empty vertical band when no selected photo is usable", () => {
    const tree = render([product(0, { image_urls: [] }), product(1, { image_urls: [" "] })]);
    expect(hero(tree)).toBeUndefined();
    expect(cards(tree)).toHaveLength(2);
    const grid = nodes(tree).find((node) => "data-collection-products" in node.props)!;
    expect(grid.props.className).toContain("lg:col-span-2 lg:grid-cols-4");
    expect(nodes(tree).filter((node) => node.type === Image)).toHaveLength(0);
  });

  it("names searches honestly across mixed categories and states an optional category constraint", () => {
    const products = [product(0), product(1, { category: "Camisas" })];
    const tree = render(products, "azul", "Todas las prendas");
    const markup = renderToStaticMarkup(tree);
    expect(nodes(tree).find((node) => node.type === "h1")?.props.children).toBe("Búsqueda: “azul”");
    expect(markup).toContain("Prendas que coinciden con tu búsqueda.");
    expect(markup).not.toMatch(/Explorá Abrigos|algodón|orgánic|LENZING|Glein/);
    expect(renderToStaticMarkup(render(products, "azul"))).toContain(
      "Prendas que coinciden con tu búsqueda en Abrigos.",
    );
    expect(renderToStaticMarkup(render(products, "", "Todas las prendas"))).toContain(
      "Explorá las prendas del catálogo.",
    );
  });

  it("stacks hero, intro and two-track cards on mobile, using a half-width desktop spread without fixed grid rows", () => {
    const tree = render(Array.from({ length: 4 }, (_, index) => product(index)));
    expect(tree.props.className).toContain("grid-cols-1 items-start");
    expect(tree.props.className).toContain("lg:grid-cols-2");
    expect(hero(tree)?.props.className).toContain("lg:aspect-[2/3]");
    expect(hero(render([product(0)]))?.props.className).toContain("lg:aspect-[4/3]");
    const grid = nodes(tree).find((node) => "data-collection-products" in node.props)!;
    expect(grid.props.className).toContain("grid-cols-2 items-start");
    const intro = nodes(grid).find((node) => node.type === "header")!;
    expect(intro.props.className).toContain("col-span-2");
    expect(intro.props.className).toContain("lg:col-span-1");
    expect(Children.toArray(grid.props.children)[0]).toEqual(intro);
    expect(
      nodes(tree)
        .map((node) => node.props.className ?? "")
        .join(" "),
    ).not.toMatch(/auto-rows|row-span|order-|dense|min-h-screen/);
  });

  it("aligns linked sans titles and actual prices on a row, with quieter mono metadata", () => {
    const tree = ProductCard({ product: product(0) });
    const info = nodes(tree).find((node) =>
      node.props.className?.includes("items-baseline justify-between"),
    )!;
    expect(info.props.className).toContain("font-sans text-[15px]");
    const title = nodes(info).find((node) => node.type === "h3")!;
    expect(title.props.className).toContain("underline");
    const metadata = nodes(tree).find((node) =>
      node.props.className?.includes("text-center text-foreground/65"),
    )!;
    expect(nodes(metadata).find((node) => node.type === "span")?.props.className).toContain(
      "font-mono text-[13px]",
    );
  });

  it("compiles actual desktop/mobile tracks, cover geometry, overlay, card and local font utilities", async () => {
    const trees = [
      render([product(0)]),
      render(Array.from({ length: 4 }, (_, i) => product(i))),
      render([product(0, { image_urls: [] })]),
    ];
    const markup = trees.map((tree) => renderToStaticMarkup(tree)).join("");
    const classes = [...markup.matchAll(/class="([^"]+)"/g)].flatMap((match) =>
      match[1].split(/\s+/),
    );
    const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const theme = readFileSync(
      new URL("../../node_modules/tailwindcss/theme.css", import.meta.url),
      "utf8",
    );
    const compiler = await compile(
      `${theme}\n${(globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? []).join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build(classes);
    const utility = (name: string, property: string, value: string, desktop = false) => {
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
      const start = css.indexOf(selector);
      expect(start, name).toBeGreaterThanOrEqual(0);
      let depth = 0;
      let block = "";
      for (let index = start + selector.length - 1; index < css.length; index++) {
        if (css[index] === "{") depth++;
        if (css[index] === "}" && --depth === 0) {
          block = css.slice(start, index + 1);
          break;
        }
      }
      expect(block, name).toContain(`${property}: ${value};`);
      if (desktop) expect(block).toContain("@media (width >= 64rem)");
    };
    utility("grid-cols-1", "grid-template-columns", "repeat(1, minmax(0, 1fr))");
    utility("grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))");
    utility("lg:grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))", true);
    utility("lg:grid-cols-4", "grid-template-columns", "repeat(4, minmax(0, 1fr))", true);
    utility("lg:col-span-1", "grid-column", "span 1 / span 1", true);
    utility("lg:aspect-[2/3]", "aspect-ratio", "2/3", true);
    utility("lg:aspect-[4/3]", "aspect-ratio", "4/3", true);
    utility("top-[55%]", "top", "55%");
    utility("object-cover", "object-fit", "cover");
    utility("font-sans", "font-family", "var(--font-familjen-grotesk)");
    utility("font-mono", "font-family", "var(--font-maison-neue-mono-local)");
    utility("text-[15px]", "font-size", "15px");
    utility("text-[13px]", "font-size", "13px");
    utility("items-baseline", "align-items", "baseline");
    utility("justify-between", "justify-content", "space-between");
  });
});
