import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Image from "next/image";
import Link from "next/link";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPrice } from "@/lib/config";
import type { Product } from "@/lib/types";
import { CartDrawer } from "./cart-drawer";

// Shallow elements and mocked callbacks only: no mounted dialog, persistence or services.
const cart = vi.hoisted(() => ({
  items: [] as { product: Product; quantity: number }[],
  totalItems: 0,
  totalPrice: 0,
  couponCode: "",
  isOpen: true,
  removeItem: vi.fn(),
  setCouponCode: vi.fn(),
  setIsOpen: vi.fn(),
}));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => cart }));

const product: Product = {
  id: "v2-fixture",
  slug: "camisa",
  title: "Camisa de lino natural con un título extenso para pantallas pequeñas",
  description: null,
  price: 10000,
  current_price: 8000,
  promotion_percent: 20,
  promotion_ends_at: null,
  size: "M",
  color: "Azul, Multicolor",
  category: "hombre",
  subcategory: "camisas",
  brand: null,
  condition: null,
  measurements: null,
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
const elements = (node: ReactNode, type: unknown) =>
  descendants(node).filter((element) => element.type === type);
const filled = () => {
  Object.assign(cart, {
    items: [{ product, quantity: 2 }],
    totalItems: 7,
    totalPrice: 34567,
    couponCode: "AHORRO20",
  });
  return CartDrawer();
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(cart, { items: [], totalItems: 0, totalPrice: 0, couponCode: "", isOpen: true });
});

describe("V2 editorial cart composition", () => {
  it("retains Sheet ownership of dismissal, focus and title while reserving a larger close target", () => {
    const tree = CartDrawer();
    expect(tree.type).toBe(Sheet);
    expect(tree.props).toMatchObject({ open: true, onOpenChange: cart.setIsOpen });
    const content = elements(tree, SheetContent)[0];
    expect(content.props["aria-describedby"]).toBeUndefined();
    for (const attribute of [
      "showCloseButton",
      "onCloseAutoFocus",
      "onEscapeKeyDown",
      "onInteractOutside",
    ])
      expect(content.props[attribute]).toBeUndefined(); // No overrides of shared Radix behavior.
    expect(content.props.className).toContain("w-full");
    expect(content.props.className).toContain("sm:max-w-[560px]");
    expect(content.props.className).toContain("gap-[0px] overflow-hidden");
    expect(content.props.className).toContain("[&>[data-slot=sheet-close]]:size-[44px]");
    expect(elements(tree, SheetHeader)[0].props.className).toContain("pr-[72px]");
    const title = elements(tree, SheetTitle)[0];
    expect(title.props.className).toContain("text-[30px]");
    expect(title.props.children).toEqual(["Carrito (", 0, ")"]);
    (tree.props.onOpenChange as (open: boolean) => void)(false);
    expect(cart.setIsOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("gives the unchanged empty message a restrained sand field, without invented actions", () => {
    const tree = CartDrawer();
    const empty = elements(tree, "p")[0];
    expect(empty.props.children).toBe("Tu carrito está vacío");
    expect(empty.props.className).toContain("max-w-[10ch]");
    expect(empty.props.className).toContain("text-[36px]");
    expect(empty.props.className).toContain("sm:text-[48px]");
    const field = elements(tree, "div")[0];
    expect(field.props.className).toContain("flex-1");
    expect(field.props.className).toContain("overflow-y-auto bg-warm-sand");
    expect(elements(tree, "ul")).toHaveLength(0);
    expect(elements(tree, "input")).toHaveLength(0);
    expect(elements(tree, Link)).toHaveLength(0);
    expect(elements(tree, "button")).toHaveLength(0);
  });

  it("uses separated portrait rows with wrapping titles, readable metadata and touch-sized removal", () => {
    const tree = filled();
    const list = elements(tree, "ul")[0];
    expect(list.props.className).toContain("min-h-0 flex-1 divide-y divide-midnight-ink");
    expect(list.props.className).toContain("overflow-y-auto overscroll-contain");
    const row = elements(list, "li")[0];
    expect(row.props.className).toContain("py-[24px]");
    expect(row.props.className).toContain("sm:py-[30px]");
    const title = elements(row, "h3")[0];
    expect(title.props.children).toBe(product.title);
    expect(title.props.className).toContain("break-words");
    expect(title.props.className).not.toMatch(/truncate|line-clamp/);
    const photo = elements(row, Image)[0];
    expect(photo.props).toMatchObject({
      src: "/front.jpg",
      alt: product.title,
      fill: true,
      sizes: "(min-width: 640px) 104px, 88px",
      className: "object-cover",
    });
    const field = elements(row, "div")[0];
    expect(field.props.className).toContain("relative flex aspect-4/5 w-[88px] shrink-0");
    expect(field.props.className).toContain("sm:w-[104px]");
    const [metadata, price] = elements(row, "p");
    expect(metadata.props.children).toEqual([product.color, " · Talle ", product.size]);
    expect(metadata.props.className).toContain("break-words font-mono");
    expect(price.props.children).toBe(formatPrice(product.price)); // Not current_price or quantity-derived.
    expect(price.props.className).toContain("mt-auto pt-[18px]");
    const remove = elements(row, "button")[0];
    expect(remove.props["aria-label"]).toBe("Quitar producto");
    expect(remove.props.className).toContain("h-[44px] w-[44px]");
    expect(remove.props.className).toContain("focus-visible:outline-2");
    (remove.props.onClick as () => void)();
    expect(cart.removeItem).toHaveBeenCalledExactlyOnceWith(product.id);
    expect(cart.setIsOpen).not.toHaveBeenCalled();
  });

  it("keeps coupon, supplied totals and checkout in a separately scrollable safe-area summary", () => {
    const tree = filled();
    expect(elements(tree, SheetTitle)[0].props.children).toEqual(["Carrito (", 7, ")"]);
    const summary = elements(tree, "div").find((element) =>
      element.props.className?.includes("max-h-[60dvh]"),
    )!;
    expect(summary.props.className).toContain("shrink-0");
    expect(summary.props.className).toContain("overflow-y-auto overscroll-contain");
    expect(summary.props.className).toContain("border-t border-midnight-ink bg-warm-sand");
    expect(summary.props.className).toContain("pb-[max(24px,env(safe-area-inset-bottom))]");
    const input = elements(summary, "input")[0];
    expect(input.props).toMatchObject({
      id: "cart-coupon-code",
      value: "AHORRO20",
      placeholder: "Ingresalo para cotizarlo en checkout",
    });
    expect(elements(summary, "label")[0].props.htmlFor).toBe(input.props.id);
    expect(input.props.className).toContain("h-[48px]");
    expect(input.props.className).toContain("text-[16px]");
    expect(input.props.className).toContain("focus-visible:outline-2");
    (input.props.onChange as (event: unknown) => void)({ target: { value: "nuevo" } });
    expect(cart.setCouponCode).toHaveBeenCalledExactlyOnceWith("nuevo");
    expect(elements(summary, "p")[0].props.children).toBe(
      "Elegirás entre el cupón y las promociones antes de pagar.",
    );
    const total = elements(summary, "span")[1];
    expect(total.props.children).toBe(formatPrice(cart.totalPrice));
    expect(total.props.className).toContain("text-[30px]");
    const checkout = elements(summary, Link)[0];
    expect(checkout.props.href).toBe("/checkout");
    expect(checkout.props.children).toBe("Ir al Checkout");
    expect(checkout.props.className).toContain("min-h-[48px]");
    expect(checkout.props.className).toContain("focus-visible:outline-2");
    (checkout.props.onClick as () => void)();
    expect(cart.setIsOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([{ images: [] }, { images: ["/second.jpg"] }])(
    "retains truthful media/fallback and identity-specific removal with $images",
    ({ images }) => {
      filled();
      cart.items.push({ product: { ...product, id: "second", image_urls: images }, quantity: 1 });
      const rows = elements(CartDrawer(), "li");
      expect(rows).toHaveLength(2);
      const photos = elements(rows[1], Image);
      expect(photos).toHaveLength(images.length);
      if (images.length) expect(photos[0].props.src).toBe(images[0]);
      else expect(elements(rows[1], "span")[0].props.children).toBe(product.category);
      (elements(rows[1], "button")[0].props.onClick as () => void)();
      expect(cart.removeItem).toHaveBeenCalledExactlyOnceWith("second");
    },
  );

  it.each([0, 999999999])(
    "displays supplied total %s without deriving new pricing",
    (totalPrice) => {
      filled();
      cart.totalPrice = totalPrice;
      const totals = elements(CartDrawer(), "span");
      expect(totals[1].props.children).toBe(formatPrice(totalPrice));
      expect(cart.removeItem).not.toHaveBeenCalled();
      expect(cart.setCouponCode).not.toHaveBeenCalled();
      expect(cart.setIsOpen).not.toHaveBeenCalled();
    },
  );

  it("preserves all business expressions, branches and iterators against the immutable pretask source", () => {
    // Cart was clean at V2 entry. This fixed commit remains valid as later units change HEAD.
    const baseline = execFileSync(
      "git",
      ["show", "41679236782abed3b2de9503075195e5e2b90ff3:src/components/cart-drawer.tsx"],
      { encoding: "utf8" },
    );
    const expressions = (source: string) => {
      const file = ts.createSourceFile(
        "cart.tsx",
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
      const record = (node: ts.Node) => result.push(node.getText(file).replace(/\s+/g, " "));
      const visit = (node: ts.Node) => {
        if (ts.isJsxExpression(node) && node.expression && !containsJSX(node.expression))
          record(node.expression);
        if (ts.isConditionalExpression(node)) record(node.condition);
        if (ts.isCallExpression(node) && containsJSX(node)) record(node.expression);
        ts.forEachChild(node, visit);
      };
      visit(file);
      return result;
    };
    expect(
      expressions(readFileSync(new URL("./cart-drawer.tsx", import.meta.url), "utf8")),
    ).toEqual(expressions(baseline));
  });
});
