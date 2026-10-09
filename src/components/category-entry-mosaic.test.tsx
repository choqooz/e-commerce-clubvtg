import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Image from "next/image";
import postcss from "postcss";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { compile } from "tailwindcss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/lib/config";
import type { Product } from "@/lib/types";
import { CategoryBanner } from "./category-banner";

const probe = vi.hoisted(() => ({ failedCover: null as string | null, setFailedCover: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [probe.failedCover, probe.setFailedCover],
}));

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
function descendants(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
}
function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "first",
    title: "Camisa vintage",
    slug: "camisa-vintage",
    description: null,
    price: 10000,
    size: "M",
    color: null,
    category: "tops",
    image_urls: ["/shirt.jpg"],
    status: "available",
    reserved_at: null,
    created_at: "",
    updated_at: "",
    subcategory: "camisas",
    brand: null,
    condition: null,
    measurements: null,
    product_type_id: null,
    product_subtype_id: null,
    ...overrides,
  };
}
const entry = (initialProducts: Product[] = [], onCategoryChange = vi.fn()) =>
  CategoryBanner({ initialProducts, onCategoryChange });
const mosaic = (tree: Element) =>
  descendants(tree).find((element) => element.props.className?.split(" ").includes("grid"))!;
const tiles = (tree: Element) => Children.toArray(mosaic(tree).props.children) as Element[];
const illustrativeCover = "/glein-entry/clothing.jpg";
const entryOrder = ["tops", "outerwear", "accessories", "footwear", "bottoms", "knitwear"];
function renderTile(tile: Element): Element {
  return (tile.type as (props: Element["props"]) => Element)(tile.props);
}
const image = (tree: ReactNode) => descendants(tree).find((element) => element.type === Image);

beforeEach(() => {
  vi.clearAllMocks();
  probe.failedCover = null;
});

describe("Category-photo entry", () => {
  it("prefers the first usable photo of the first matching available product", () => {
    const products = [
      product({ status: "sold", image_urls: ["/sold.jpg"] }),
      product({ status: "reserved", image_urls: ["/reserved.jpg"] }),
      product({ category: "Tops", image_urls: ["/different-taxonomy.jpg"] }),
      product({ image_urls: ["", "   ", "bad-url", "javascript:alert(1)", "//example.com/a.jpg"] }),
      product({ id: "cover", image_urls: [" ", "  /real-shirt.jpg  ", "/other-angle.jpg"] }),
      product({ id: "later", image_urls: ["/later.jpg"] }),
    ];
    const tile = tiles(entry(products))[0];
    expect(tile.props.cover).toBe("/real-shirt.jpg");
    const markup = renderToStaticMarkup(entry(products));
    expect(markup).toContain("real-shirt.jpg");
    expect(markup).not.toContain("sold.jpg");
    expect(markup).not.toContain("other-angle.jpg");
    // Exact mismatches may be illustrative elsewhere, never a matching Tops cover.
    expect(tile.props.illustrative).toBe(false);
    expect(markup.match(/<img\b/g)).toHaveLength(6);
    expect(markup.match(/Imagen ilustrativa/g)).toHaveLength(5);
    const realTile = renderToStaticMarkup(renderTile(tile));
    expect(realTile).not.toContain("Imagen ilustrativa");
    expect(realTile).not.toContain("different-taxonomy.jpg");
    expect(image(renderTile(tile))?.props.src).toBe("/real-shirt.jpg");
  });

  it("does not label actual product covers as illustrative when every category has a photo", () => {
    const products = CATEGORIES.filter((category) => category.id !== "all").map((category) =>
      product({ id: category.id, category: category.id, image_urls: [`/${category.id}.jpg`] }),
    );
    const tree = entry(products);
    const markup = renderToStaticMarkup(tree);
    expect(markup.match(/<img\b/g)).toHaveLength(6);
    expect(markup).not.toMatch(/Imagen ilustrativa|Foto ilustrativa|Imagen no disponible/);
    expect(descendants(tree).filter((element) => element.type === "a")).toHaveLength(0);
    expect(tiles(tree).map((tile) => image(renderTile(tile))?.props.src)).toEqual(
      entryOrder.map((category) => `/${category}.jpg`),
    );
  });

  it("distributes nonmatching available photos truthfully without changing categories or using the rack", () => {
    const products = Array.from({ length: 6 }, (_, index) =>
      product({
        id: `other-${index}`,
        category: "hombre",
        image_urls: [`/other-${index}.jpg`],
      }),
    );
    const before = JSON.stringify(products);
    const tree = entry(products);
    expect(tiles(tree).map((tile) => tile.props.cover)).toEqual(
      products.map((item) => item.image_urls[0]),
    );
    expect(tiles(tree).every((tile) => tile.props.illustrative === true)).toBe(true);
    const markup = renderToStaticMarkup(tree);
    expect(markup.match(/Imagen ilustrativa · otra categoría/g)).toHaveLength(6);
    expect(markup).not.toMatch(/Rico Shen|clothing.jpg|En stock|Vendido/);
    for (const tile of tiles(tree)) {
      const rendered = renderTile(tile);
      const caption = descendants(rendered).find((element) =>
        element.props.className?.includes("bottom-[13px]"),
      )!;
      expect(caption.props.className).not.toMatch(/bg-bone-white|inset-x|w-full/);
    }
    expect(JSON.stringify(products)).toBe(before);
    expect(tiles(entry(products)).map((tile) => tile.props.cover)).toEqual(
      tiles(tree).map((tile) => tile.props.cover),
    );
  });

  it("uses the licensed rack only when no usable available product cover exists", () => {
    const tree = entry([product({ category: "unmapped", image_urls: ["/actual.jpg"] })]);
    expect(tiles(tree).map((tile) => tile.props.cover)).toEqual(Array(6).fill("/actual.jpg"));
    expect(renderToStaticMarkup(tree)).not.toContain("Rico Shen");
    expect(
      tiles(entry([product({ status: "sold" })])).every(
        (tile) => tile.props.cover === illustrativeCover,
      ),
    ).toBe(true);
  });

  it("handles local and HTTPS photos without adding remote host configuration", () => {
    const remote = "https://photos.example.com/actual-product.jpg";
    const tree = entry([
      product({ image_urls: ["http://example.com/insecure.jpg", remote] }),
      product({ category: "bottoms", image_urls: ["/pants.jpg"] }),
    ]);
    const [top, , , , bottom] = tiles(tree).map(renderTile);
    expect(image(top)?.props).toMatchObject({
      src: remote,
      alt: "",
      fill: true,
      unoptimized: true,
    });
    expect(image(bottom)?.props).toMatchObject({ src: "/pants.jpg", unoptimized: false });
    expect(image(top)?.props.sizes).toBe("(min-width: 768px) 50vw, 100vw");
    expect(image(bottom)?.props.sizes).toBe("(min-width: 768px) 50vw, 100vw");
  });

  it.each([
    { products: [] },
    { products: [product({ image_urls: ["", " "] })] },
    { products: [product({ status: "archived" })] },
  ])(
    "keeps empty/blank/unavailable query entry usable with clearly illustrative local photos, not stock claims",
    ({ products }) => {
      const tree = entry(products);
      const markup = renderToStaticMarkup(tree);
      expect(markup.match(/<img\b/g)).toHaveLength(6);
      expect(markup.match(/Imagen ilustrativa/g)).toHaveLength(6);
      expect(markup).not.toMatch(/En stock|Agotado|Disponible|Imagen no disponible/);
      expect(markup.match(/type="button"/g)).toHaveLength(6);
      for (const tile of tiles(tree))
        expect(image(renderTile(tile))?.props).toMatchObject({
          src: illustrativeCover,
          alt: "",
          unoptimized: false,
        });
    },
  );

  it("keeps covers and configured labels stable when only a different category is selected", () => {
    const products = [product(), product({ category: "bottoms", image_urls: ["/pants.jpg"] })];
    const before = tiles(entry(products)).map((tile) => tile.props.cover);
    const onCategoryChange = vi.fn();
    const tree = entry(products, onCategoryChange);
    const tile = renderTile(tiles(tree)[4]);
    (tile.props.onClick as () => void)();
    expect(onCategoryChange).toHaveBeenCalledExactlyOnceWith("bottoms");
    expect(tiles(entry(products)).map((tile) => tile.props.cover)).toEqual(before);
    expect(tiles(tree).map((tile) => [tile.props.category, tile.props.label])).toEqual(
      entryOrder.map((id) => [id, CATEGORIES.find((category) => category.id === id)!.label]),
    );
  });

  it("keeps all six native actions named, focusable and linked to the stable catalog anchor", () => {
    const onCategoryChange = vi.fn();
    const tree = entry([], onCategoryChange);
    for (const tile of tiles(tree)) {
      const button = renderTile(tile);
      expect(button.type).toBe("button");
      expect(button.props).toMatchObject({
        type: "button",
        "aria-controls": "catalog",
        "aria-label": `Ver ${tile.props.label} en el catálogo`,
      });
      expect(button.props.disabled).toBeUndefined();
      expect(button.props.tabIndex).toBeUndefined();
      (button.props.onClick as () => void)();
      expect(onCategoryChange).toHaveBeenLastCalledWith(tile.props.category);
    }
    expect(onCategoryChange).toHaveBeenCalledTimes(6);
    expect(renderToStaticMarkup(tree)).not.toContain("Ver Todo en el catálogo");
  });

  it.each([false, true])(
    "floats centered white lettering directly on photos without any masking background (real cover: %s)",
    (realCover) => {
      const tree = entry(realCover ? [product()] : []);
      for (const tile of tiles(tree)) {
        const button = renderTile(tile);
        const textBox = descendants(button).find((element) =>
          element.props.className?.includes("group-focus-visible:outline-2"),
        )!;
        expect(textBox.props.className).toContain("text-bone-white");
        expect(textBox.props.className).toContain("group-focus-visible:outline-bone-white");
        expect(textBox.props.className).not.toMatch(/bg-|shadow|rounded-/);
        expect(textBox.props.className).toContain("w-max max-w-full");
        expect(textBox.props.className!.split(" ")).not.toContain("w-full");
        const title = descendants(textBox).find(
          (element) => element.props.children === tile.props.label,
        )!;
        expect(title.props.className).toContain("font-sans");
        expect(title.props.className).not.toMatch(/bg-|text-midnight-ink|shadow|rounded-/);
        const collection = descendants(textBox).find(
          (element) => element.props.children === "Ver colección",
        )!;
        expect(collection.type).toBe("span"); // The native enclosing button owns the existing category action.
        expect(collection.props.className).toContain("font-mono text-[13px] font-normal");
        expect(button.props.className).toContain("items-center justify-center");
        const overlays = descendants(button.props.children);
        expect(overlays.map((element) => element.props.className ?? "").join(" ")).not.toMatch(
          /bg-|gradient|shadow|blur|text-shadow/,
        );
        for (const overlay of overlays.filter((element) => element.type === "span"))
          expect(overlay.props.style).toBeUndefined();
        expect(overlays.filter((element) => element.props["aria-hidden"] === "true")).toHaveLength(
          0,
        );
      }
    },
  );

  it("falls back truthfully on image load failure and recovers for a new product cover", () => {
    const tile = tiles(entry([product()]))[0];
    const initial = renderTile(tile);
    (image(initial)!.props.onError as () => void)();
    expect(probe.setFailedCover).toHaveBeenCalledExactlyOnceWith("/shirt.jpg");
    probe.failedCover = "/shirt.jpg";
    const failed = renderTile(tile);
    expect(image(failed)).toBeUndefined();
    expect(renderToStaticMarkup(failed)).toContain("Imagen no disponible");
    const textBox = descendants(failed).find((element) =>
      element.props.className?.includes("group-focus-visible:outline-2"),
    )!;
    expect(textBox.props.className).toContain("text-midnight-ink");
    expect(textBox.props.className).toContain("group-focus-visible:outline-midnight-ink");
    expect(
      descendants(textBox).filter((element) => element.props["aria-hidden"] === "true"),
    ).toHaveLength(0);
    expect(renderToStaticMarkup(failed)).not.toContain("Ver colección");
    expect(
      image(renderTile(tiles(entry([product({ image_urls: ["/replacement.jpg"] })]))[0]))?.props
        .src,
    ).toBe("/replacement.jpg");
  });

  it("uses mixed column/row spans without dense reordering and keeps mobile within two tracks", () => {
    const tree = entry();
    expect(mosaic(tree).props.className).toContain("grid-cols-2");
    expect(mosaic(tree).props.className).toContain("md:grid-cols-4");
    expect(mosaic(tree).props.className).toContain("gap-[10px]");
    expect(mosaic(tree).props.className).not.toContain("dense");
    const classes = tiles(tree).map((tile) => renderTile(tile).props.className);
    expect(mosaic(tree).props.className).toContain("auto-rows-[62.5vw]");
    expect(mosaic(tree).props.className).toContain("md:auto-rows-[31.25vw]");
    expect(classes[0]).toContain("col-span-2 md:col-start-1 md:row-start-1");
    expect(classes[0]).not.toContain("row-span-2");
    expect(classes[1]).toContain("col-span-2 row-span-2 md:col-start-3 md:row-start-1");
    expect(classes[2]).toContain("md:col-start-1 md:row-start-2");
    expect(classes[3]).toContain("md:col-start-2 md:row-start-2");
    expect(classes[4]).toContain("col-span-2 row-span-2 md:col-start-1 md:row-start-3");
    expect(classes[5]).toContain("col-span-2 row-span-2 md:col-start-3 md:row-start-3");
    expect(classes.join(" ")).not.toMatch(
      /col-span-[3-9]|shadow|rounded-(?!none)|transition|scale-|clamp|order-/,
    );
  });

  it("retains the text fallback if the local illustrative photo fails, without a retry loop", () => {
    const tile = tiles(entry())[0];
    const initial = renderTile(tile);
    expect(renderToStaticMarkup(initial)).toContain("Imagen ilustrativa");
    (image(initial)!.props.onError as () => void)();
    expect(probe.setFailedCover).toHaveBeenCalledExactlyOnceWith(illustrativeCover);
    probe.failedCover = illustrativeCover;
    const failed = renderTile(tile);
    expect(image(failed)).toBeUndefined();
    expect(renderToStaticMarkup(failed)).toContain("Imagen no disponible");
    expect(renderToStaticMarkup(failed)).not.toContain("Imagen ilustrativa");
    expect(image(renderTile(tiles(entry([product()]))[0]))?.props.src).toBe("/shirt.jpg");
  });

  it("credits the verified source/license outside the buttons and identifies display crops", () => {
    const tree = entry();
    const links = descendants(tree).filter((element) => element.type === "a");
    expect(links.map((link) => link.props.href)).toEqual([
      "https://commons.wikimedia.org/wiki/File:2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    ]);
    expect(links[1].props.rel).toBe("license");
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain("Rico Shen / Wikimedia Commons");
    expect(markup).toContain("Recortes de encuadre.");
    for (const tile of tiles(tree))
      expect(descendants(renderTile(tile)).filter((element) => element.type === "a")).toHaveLength(
        0,
      );
    const positions = tiles(tree).map((tile) => image(renderTile(tile))?.props.style);
    expect(new Set(positions.map((position) => JSON.stringify(position))).size).toBe(6);
  });

  it("bundles the verified JPEG within budget and records matching dimensions/hash/provenance", async () => {
    const asset = readFileSync(new URL("../../public/glein-entry/clothing.jpg", import.meta.url));
    const provenance = readFileSync(
      new URL("../../public/glein-entry/README.md", import.meta.url),
      "utf8",
    );
    expect(asset.length).toBe(320114);
    expect(asset.length).toBeLessThanOrEqual(1000000);
    expect([...asset.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(await sharp(asset).metadata()).toMatchObject({
      format: "jpeg",
      width: 1280,
      height: 960,
    });
    expect(provenance).toContain(createHash("sha256").update(asset).digest("hex"));
    for (const evidence of [
      "1280 × 960",
      "320114",
      "Rico Shen",
      "CC BY-SA 4.0",
      "https://unsplash.com/license",
      "Firecrawl",
    ])
      expect(provenance).toContain(evidence);
  });

  it("compiles responsive/focus CSS with unboxed white text and dark image-failure text", async () => {
    const photoMarkup = renderToStaticMarkup(entry([product()]));
    probe.failedCover = "/shirt.jpg";
    const markup = photoMarkup + renderToStaticMarkup(entry([product()]));
    const classes = [...markup.matchAll(/class="([^"]+)"/g)].flatMap((match) =>
      match[1].split(/\s+/),
    );
    // Responsive image rows and tile spans all render even when product coverage is sparse.
    const theme = readFileSync(
      new URL("../../node_modules/tailwindcss/theme.css", import.meta.url),
      "utf8",
    );
    const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const compiler = await compile(
      `${theme}\n${(globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? []).join("\n")}\n@tailwind utilities;`,
    );
    const css = postcss.parse(compiler.build(classes));
    function utility(name: string, property: string, value: string) {
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`;
      let found = false;
      css.walkRules((rule) => {
        if (rule.selector !== selector) return;
        rule.walkDecls(property, (declaration) => {
          if (declaration.value === value) found = true;
        });
      });
      expect(found, `${name}: ${property}: ${value}`).toBe(true);
    }
    for (const [name, property, value] of [
      ["grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))"],
      ["md:grid-cols-4", "grid-template-columns", "repeat(4, minmax(0, 1fr))"],
      ["gap-[10px]", "gap", "10px"],
      ["col-span-2", "grid-column", "span 2 / span 2"],
      ["row-span-2", "grid-row", "span 2 / span 2"],
      ["md:col-start-3", "grid-column-start", "3"],
      ["md:row-start-2", "grid-row-start", "2"],
      ["md:row-start-3", "grid-row-start", "3"],
      ["auto-rows-[62.5vw]", "grid-auto-rows", "62.5vw"],
      ["md:auto-rows-[31.25vw]", "grid-auto-rows", "31.25vw"],
      ["w-max", "width", "max-content"],
      ["max-w-full", "max-width", "100%"],
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["object-cover", "object-fit", "cover"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:-outline-offset-[6px]", "outline-offset", "calc(6px * -1)"],
      ["group-focus-visible:outline-2", "outline-width", "2px"],
      ["group-focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["group-focus-visible:outline-bone-white", "outline-color", "var(--color-bone-white)"],
      ["text-bone-white", "color", "var(--color-bone-white)"],
    ])
      utility(name, property, value);
    expect(compiler.build(classes)).toContain("@media (width >= 48rem)");
    expect(compiler.build(classes)).toContain("&:focus-visible");

    expect(classes.join(" ")).not.toMatch(/gradient|shadow|blur|text-shadow/);
    // Unmasked lettering intentionally has no universal photo-contrast guarantee.
    // Browser sampling must evaluate the actual covers, crops, captions and focus outlines.
    css.walkDecls("background-image", (declaration) => {
      expect(declaration.value).not.toContain("gradient");
    });
  });
});
