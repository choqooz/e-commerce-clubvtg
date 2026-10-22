import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Image from "next/image";
import { ProgressiveImage } from "./progressive-image";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Swiper } from "swiper/react";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { ProductDetailContent } from "./product-detail-content";
import { ProductGallery } from "./product-gallery";

// Shallow element contracts only: no mounted DOM, network, cart or analytics services.
const probe = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = probe.index++;
    if (index >= probe.states.length) probe.states[index] = initial;
    return [
      probe.states[index],
      (value: unknown) => {
        probe.states[index] = typeof value === "function" ? value(probe.states[index]) : value;
      },
    ];
  },
}));
vi.mock("@/contexts/analytics-context", () => ({ useAnalytics: () => null }));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/components/try-on-section", () => ({ TryOnSection: () => null }));

const product: Product = {
  id: "v1-fixture",
  slug: "camisa",
  title: "Camisa de lino",
  description: "Lino natural",
  price: 10000,
  current_price: undefined,
  promotion_percent: null,
  promotion_ends_at: null,
  size: "M",
  color: "Azul, Multicolor",
  category: "hombre",
  subcategory: "camisas",
  brand: "Original",
  condition: "Muy bueno",
  measurements: "50 × 70 cm",
  image_urls: ["/front.jpg", "/back.jpg"],
  status: "available",
  reserved_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  product_type_id: null,
  product_subtype_id: null,
};
type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const tree = (overrides: Partial<Product> = {}) => {
  probe.index = 0;
  const expand = (tree: ReactNode): ReactNode => {
    if (Array.isArray(tree)) return tree.map(expand);
    if (!isValidElement(tree)) return tree;
    const node = tree as Element;
    if (node.type === ProductGallery)
      return expand(ProductGallery(node.props as Parameters<typeof ProductGallery>[0]));
    return cloneElement(node, {}, expand(node.props.children));
  };
  const result = expand(
    ProductDetailContent({ product: { ...product, ...overrides }, relatedProducts: [product] }),
  );
  const carousel = descendants(result).find((node) => node.type === Swiper);
  if (carousel) {
    const instance = {
      activeIndex: probe.states[0],
      slideTo(index: number) {
        this.activeIndex = index;
        (carousel.props.onSlideChange as (instance: unknown) => void)(this);
      },
    };
    (carousel.props.onSwiper as (instance: unknown) => void)(instance);
  }
  return result;
};
const controls = (node: ReactNode) =>
  descendants(node).filter(
    (element) => element.type === "button" && typeof element.props["aria-pressed"] === "boolean",
  );
beforeEach(() => {
  probe.states = [];
  probe.index = 0;
});

describe("V1 editorial product composition", () => {
  it("places a dominant gallery beside top-aligned information, stacking in source order on mobile", () => {
    const nodes = descendants(tree());
    const spread = nodes.find((element) => element.props.className?.includes("lg:grid-cols-["))!;
    expect(spread.props.className).toContain("grid-cols-1 items-start gap-[0px]");
    expect(spread.props.className).toContain("lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]");
    const [gallery, info] = Children.toArray(spread.props.children) as Element[];
    expect(gallery.props["aria-label"]).toBe("Galería del producto");
    expect(info.props.className).not.toMatch(/justify-center|order-|sticky/);
    expect(info.props.className).toContain("lg:py-[36px]");
    const field = nodes.find((element) => element.props.id === "product-active-image")!;
    expect(field.props.className).toContain("relative w-full");
    expect(field.props["aria-busy"]).toBe(true);
    const hero = descendants(field).find((element) => element.type === ProgressiveImage)!;
    expect(hero.props).toMatchObject({
      width: 0,
      height: 0,
      preload: true,
      sizes: "(min-width: 1024px) 58.33vw, 100vw",
      style: { width: "100%", height: "auto" },
      alt: product.title,
    });
    expect(hero.props.fill).toBeUndefined();
    expect(hero.props.priority).toBeUndefined(); // Next 16 replaces deprecated priority with preload.
    const header = descendants(info).find((element) => element.type === "header")!;
    expect(header.props.className).toContain("border-b border-midnight-ink");
    const title = descendants(header).find((element) => element.type === "h1")!;
    expect(title.props.className).toContain("lg:text-[48px]");
    const purchase = descendants(info).find((element) => element.type === "button")!;
    expect(purchase.props.className).toContain("min-h-[48px]");
    expect(purchase.props.className).toContain("focus-visible:outline-2");
    expect(purchase.props.type).toBe("button");
    expect(
      nodes.filter((element) => element.type === "h2").map((element) => element.props.children),
    ).toEqual(["Detalles Adicionales", "También te puede gustar"]);
  });

  it("keeps a touch-sized scrollable index, explicit selected state and the original gallery callback", () => {
    let current = tree();
    const first = controls(current);
    expect(first.map((element) => element.props["aria-pressed"])).toEqual([true, false]);
    expect(first.map((element) => element.props["aria-label"])).toEqual([
      `Ver vista 1 de ${product.title}`,
      `Ver vista 2 de ${product.title}`,
    ]);
    for (const control of first) {
      expect(control.props.type).toBe("button");
      expect(control.props.className).toContain("w-[72px] shrink-0");
      expect(control.props.className).toContain("md:w-[84px]");
      expect(control.props.className).toContain("focus-visible:-outline-offset-2");
      expect(descendants(control).find((element) => element.type === Image)!.props.sizes).toBe(
        "(min-width: 768px) 84px, 72px",
      );
    }
    expect(
      descendants(current).some((element) => element.props.className?.includes("overflow-x-auto")),
    ).toBe(true);
    (first[1].props.onClick as () => void)();
    current = tree();
    expect(controls(current).map((element) => element.props["aria-pressed"])).toEqual([
      false,
      true,
    ]);
    const field = descendants(current).find(
      (element) => element.props.id === "product-active-image",
    )!;
    const activePhoto = descendants(field).find(
      (element) => element.props["data-active"] === true,
    )!;
    expect(
      descendants(activePhoto).find((element) => element.type === ProgressiveImage)!.props.src,
    ).toBe("/back.jpg");
  });

  it.each([{ images: [] }, { images: ["/front.jpg"] }])(
    "omits unnecessary controls for $images without inventing media",
    ({ images }) => {
      const current = tree({ image_urls: images });
      expect(controls(current)).toHaveLength(0);
      const field = descendants(current).find(
        (element) => element.props.id === "product-active-image",
      )!;
      const media = descendants(field).filter((element) => element.type === ProgressiveImage);
      expect(media).toHaveLength(images.length);
      if (!images.length)
        expect(descendants(field).find((element) => element.type === "span")!.props.children).toBe(
          product.category,
        );
    },
  );

  it("exposes color names as persistent text rather than hover-only help", () => {
    const nodes = descendants(tree());
    for (const name of ["Azul", "Multicolor"]) {
      const label = nodes.find(
        (element) => element.type === "span" && element.props.children === name,
      )!;
      expect(label.props.className).not.toMatch(/opacity-0|hidden|absolute/);
      expect(label.props.className).toContain("font-mono");
    }
    const breadcrumb = nodes.find((element) => element.type === "nav")!;
    expect(breadcrumb.props["aria-label"]).toBe("Ruta del producto");
    for (const link of descendants(breadcrumb).filter((element) => element.props.href)) {
      expect(link.props.className).toContain("min-h-[44px]");
      expect(link.props.className).toContain("focus-visible:outline-2");
    }
  });

  it("preserves leaf JSX business expressions outside the accepted main-photo field against the immutable pretask source", () => {
    // Product detail was clean at task entry. Unlike accepted dirty home, this HEAD snapshot is valid.
    const baseline = execFileSync(
      "git",
      [
        "show",
        "41679236782abed3b2de9503075195e5e2b90ff3:src/components/product-detail-content.tsx",
      ],
      { encoding: "utf8" },
    );
    const expressions = (source: string) => {
      const file = ts.createSourceFile(
        "detail.tsx",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const result: string[] = [];
      const containsJSX = (node: ts.Node): boolean =>
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node) ||
        (ts.forEachChild(node, containsJSX) ?? false);
      const visit = (node: ts.Node) => {
        // The extracted gallery's ratios/errors, badges and index callbacks are exercised
        // against the real ProductGallery in product-image-sizing and gallery tests.
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ProductGallery") {
          expect(node.getText(file)).toBe("<ProductGallery key={product.id} product={product} />");
          return;
        }
        if (
          ts.isJsxElement(node) &&
          node.openingElement.attributes.properties.some(
            (property) => property.getText(file) === 'className="relative min-w-0 space-y-[13px]"',
          )
        )
          return;
        // Retain the immutable business-expression guard everywhere outside that exact gallery.
        if (
          ts.isJsxElement(node) &&
          (node.openingElement.attributes.properties.some(
            (property) => property.getText(file) === 'id="product-active-image"',
          ) ||
            node.children.some(
              (child) =>
                ts.isJsxExpression(child) &&
                child.expression &&
                ts.isConditionalExpression(child.expression) &&
                child.expression.condition.getText(file) === "activeImage",
            ))
        )
          return;
        if (ts.isJsxExpression(node) && node.expression && !containsJSX(node.expression)) {
          const attribute = ts.isJsxAttribute(node.parent) ? node.parent.name.getText(file) : null;
          if (!["className", "aria-pressed", "aria-label"].includes(attribute ?? ""))
            result.push(node.expression.getText(file).replace(/\s+/g, " "));
          else if (attribute === "aria-label" && node.expression.getText(file) === "colorName")
            result.push("colorName"); // Existing swatch identity remains protected.
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return result;
    };
    expect(
      expressions(readFileSync(new URL("./product-detail-content.tsx", import.meta.url), "utf8")),
    ).toEqual(expressions(baseline));
  });
});
