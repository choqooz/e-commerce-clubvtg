import Image, { getImageProps, type ImageProps } from "next/image";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { ProductDetailContent } from "./product-detail-content";

// Existing node-only setup: replay real gallery callbacks/state, without DOM or remote requests.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (index >= hooks.states.length) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (value: unknown) => {
        hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value;
      },
    ];
  },
}));
vi.mock("posthog-js/react", () => ({ usePostHog: () => null }));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/components/try-on-section", () => ({ TryOnSection: () => null }));

const product: Product = {
  id: "natural-photo",
  slug: "camisa",
  title: "Camisa vintage",
  description: "Pieza original",
  price: 10000,
  size: "M",
  color: null,
  category: "tops",
  subcategory: "camisas",
  brand: "Original",
  condition: "Muy bueno",
  measurements: "50 × 70 cm",
  image_urls: ["/portrait.jpg", "/landscape.jpg", "/square.jpg"],
  status: "available",
  reserved_at: null,
  created_at: "",
  updated_at: "",
  product_type_id: null,
  product_subtype_id: null,
};
type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const nodes = (tree: ReactNode): Element[] =>
  Children.toArray(tree).flatMap((child) =>
    isValidElement(child) ? [child as Element, ...nodes((child as Element).props.children)] : [],
  );
function render(overrides: Partial<Product> = {}) {
  hooks.index = 0;
  return ProductDetailContent({ product: { ...product, ...overrides }, relatedProducts: [] });
}
const field = (tree: ReactNode) =>
  nodes(tree).find((node) => node.props.id === "product-active-image")!;
const photo = (tree: ReactNode) => nodes(field(tree)).find((node) => node.type === Image)!;
const thumbnails = (tree: ReactNode) =>
  nodes(tree).filter(
    (node) => node.type === "button" && node.props["aria-controls"] === "product-active-image",
  );
const click = (node: Element) => (node.props.onClick as () => void)();
const load = (node: Element, width: number, height: number) =>
  (node.props.onLoad as (event: unknown) => void)({
    currentTarget: { naturalWidth: width, naturalHeight: height },
  });
const optimized = (tree: ReactNode) =>
  getImageProps(photo(tree).props as unknown as ImageProps).props;

beforeEach(() => {
  hooks.states = [];
  hooks.index = 0;
});

describe("Natural-ratio product photos", () => {
  it.each([
    ["portrait", 800, 1200],
    ["landscape", 1600, 900],
    ["square", 1000, 1000],
  ])("uses measured %s dimensions without a fixed frame or crop", (_shape, width, height) => {
    let tree = render();
    expect(optimized(tree)).toMatchObject({ width: 0, height: 0 });
    expect(field(tree).props["aria-busy"]).toBe(true);
    expect(nodes(field(tree)).find((node) => node.props.role === "status")?.props.children).toBe(
      "Cargando imagen…",
    );
    load(photo(tree), width, height);
    tree = render();
    const image = optimized(tree);
    expect(image).toMatchObject({
      width,
      height,
      alt: product.title,
      sizes: "(min-width: 1024px) 58.33vw, 100vw",
      style: { width: "100%", height: "auto" },
    });
    expect(image.src).toContain("/_next/image?");
    expect(image.srcSet).toContain("640w");
    expect(image.style?.position).toBeUndefined();
    expect(image.style?.objectFit).toBeUndefined();
    expect(photo(tree).props.fill).toBeUndefined();
    expect(photo(tree).props.preload).toBe(true);
    expect(photo(tree).props.priority).toBeUndefined();
    // Normal flow, with neither wrapper ratio/padding nor clipped overflow; not browser evidence.
    expect(field(tree).props.className).toBe("relative w-full");
    expect(field(tree).props["aria-busy"]).toBe(false);
    expect(nodes(field(tree)).filter((node) => node.props.role === "status")).toHaveLength(0);
  });

  it("switches portrait/landscape/square and reuses only each URL's measured ratio", () => {
    let tree = render();
    load(photo(tree), 800, 1200);
    tree = render();
    const latePortraitLoad = photo(tree);
    click(thumbnails(tree)[1]);
    tree = render();
    expect(photo(tree).props.src).toBe("/landscape.jpg");
    expect(optimized(tree)).toMatchObject({ width: 0, height: 0 });
    load(photo(tree), 1600, 900);
    tree = render();
    expect(optimized(tree)).toMatchObject({ width: 1600, height: 900 });
    expect(thumbnails(tree).map((node) => node.props["aria-pressed"])).toEqual([
      false,
      true,
      false,
    ]);
    load(latePortraitLoad, 400, 600);
    tree = render();
    expect(optimized(tree)).toMatchObject({ width: 1600, height: 900 });
    click(thumbnails(tree)[2]);
    tree = render();
    expect(optimized(tree)).toMatchObject({ width: 0, height: 0 }); // Never borrows another ratio.
    load(photo(tree), 1000, 1000);
    tree = render();
    expect(optimized(tree)).toMatchObject({ width: 1000, height: 1000 });
    click(thumbnails(tree)[0]);
    tree = render();
    expect(optimized(tree)).toMatchObject({ width: 400, height: 600 });
    expect(thumbnails(tree).map((node) => node.props["aria-pressed"])).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("ignores invalid metadata and recovers from a failed main photo by selecting another view", () => {
    let tree = render();
    load(photo(tree), 0, 0);
    tree = render();
    expect(field(tree).props["aria-busy"]).toBe(true);
    (photo(tree).props.onError as () => void)();
    tree = render();
    expect(photo(tree)).toBeUndefined();
    expect(field(tree).props["aria-busy"]).toBe(false);
    expect(nodes(field(tree)).find((node) => node.props.role === "status")?.props.children).toBe(
      "No pudimos cargar esta imagen. Probá otra vista.",
    );
    click(thumbnails(tree)[1]);
    tree = render();
    expect(photo(tree).props.src).toBe("/landscape.jpg");
    expect(field(tree).props["aria-busy"]).toBe(true);
    load(photo(tree), 1600, 900);
    tree = render();
    expect(field(tree).props["aria-busy"]).toBe(false);
    expect(optimized(tree)).toMatchObject({ width: 1600, height: 900 });
  });

  it("does not suggest another view when a single photo fails", () => {
    const overrides = { image_urls: ["/portrait.jpg"] };
    let tree = render(overrides);
    (photo(tree).props.onError as () => void)();
    tree = render(overrides);
    expect(thumbnails(tree)).toHaveLength(0);
    expect(nodes(field(tree)).find((node) => node.props.role === "status")?.props.children).toBe(
      "No pudimos cargar esta imagen.",
    );
  });

  it.each(["sold", "reserved"] as const)(
    "keeps %s overlays and complete product information",
    (status) => {
      const tree = render({ status });
      const label = status === "sold" ? "Vendido" : "Reservado";
      expect(
        nodes(tree).some(
          (node) =>
            node.type === "span" &&
            node.props.children === label &&
            node.props.className?.includes("absolute"),
        ),
      ).toBe(true);
      expect(nodes(tree).find((node) => node.type === "h1")?.props.children).toBe(product.title);
      expect(
        nodes(tree).find((node) => node.type === "button" && node.props.disabled)?.props.children,
      ).toBe(label);
      for (const value of [
        product.description,
        product.brand,
        product.condition,
        product.measurements,
      ])
        expect(
          nodes(tree).some((node) =>
            Children.toArray(node.props.children).some((child) => child === value),
          ),
        ).toBe(true);
    },
  );

  it("has an honest no-image fallback and no thumbnail controls", () => {
    const tree = render({ image_urls: [] });
    expect(photo(tree)).toBeUndefined();
    expect(field(tree).props["aria-busy"]).toBe(false);
    expect(thumbnails(tree)).toHaveLength(0);
    expect(nodes(field(tree)).find((node) => node.props.role === "status")?.props.children).toBe(
      product.category,
    );
  });
});
