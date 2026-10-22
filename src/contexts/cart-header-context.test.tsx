import { isValidElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cart from "./cart-context";
import type { Product } from "@/lib/types";

const probe = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  capture: vi.fn(),
}));
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: probe.capture }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  // Only effects are explicit: state, memo, callback, ref and context use real React hooks.
  useEffect: (effect: () => void) => probe.effects.push(effect),
}));

type FullCart = ReturnType<typeof cart.useCart>;
type HeaderCart = Pick<FullCart, "totalItems" | "setIsOpen">;
type Snapshot = { full: FullCart; header: HeaderCart };
function HeaderReadout() {
  const header = cart.useCartHeader();
  const full = cart.useCart();
  expect(header.setIsOpen).toBe(full.setIsOpen);
  expect(header.totalItems).toBe(full.totalItems);
  return <output>{header.totalItems}</output>;
}

// Render-phase retries exercise real hook dependency/identity semantics within one SSR
// instance. This is NOT a mounted client render/subscription-count or hydration test.
function sequence(actions: ((value: FullCart) => void)[]) {
  const snapshots: Snapshot[] = [];
  const child = <HeaderReadout />;
  function Driver() {
    const [step, setStep] = useState(0);
    probe.effects = [];
    const tree = cart.CartProvider({ children: child });
    const values: unknown[] = [];
    let node: ReactNode = tree;
    while (isValidElement<{ value?: unknown; children?: ReactNode }>(node)) {
      if (node.props.value) values.push(node.props.value);
      if (node.props.children === child) break;
      node = node.props.children;
    }
    expect(isValidElement<{ children?: ReactNode }>(node) && node.props.children).toBe(child);
    const full = values.find((value) => "items" in (value as object)) as FullCart;
    const header = values.find((value) => !("items" in (value as object))) as HeaderCart;
    snapshots.push({ full, header });
    if (step < actions.length) {
      actions[step](full);
      setStep(step + 1);
    }
    return tree;
  }
  const markup = renderToStaticMarkup(<Driver />);
  return { snapshots, markup };
}

const product: Product = {
  id: "shirt",
  slug: "shirt",
  title: "Shirt",
  description: null,
  price: 10000,
  category: "tops",
  subcategory: null,
  size: null,
  color: null,
  brand: null,
  condition: null,
  measurements: null,
  image_urls: [],
  status: "available",
  reserved_at: null,
  created_at: "",
  updated_at: "",
  product_type_id: null,
  product_subtype_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  probe.effects = [];
  vi.stubGlobal("window", { location: { href: "https://store.example/" } });
  vi.stubGlobal("document", { activeElement: null });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("Narrow header cart context", () => {
  it("keeps the same header value across drawer, coupon and empty hydration state changes", () => {
    const { snapshots, markup } = sequence([
      (value) => value.setIsOpen(true),
      (value) => value.setIsOpen(false),
      (value) => value.setCouponCode("SAVE"),
      (value) => value.selectCoupon(),
      (value) => value.clearCouponSelection(),
      () => probe.effects[0](), // Explicit localStorage hydration effect, not a DOM hydration.
    ]);
    const first = snapshots[0];
    for (const snapshot of snapshots.slice(1)) {
      expect(snapshot.header).toBe(first.header);
      expect(snapshot.header.setIsOpen).toBe(first.full.setIsOpen);
      expect(snapshot.full).not.toBe(first.full);
    }
    expect(Object.keys(first.header).sort()).toEqual(["setIsOpen", "totalItems"]);
    expect(snapshots.map(({ full }) => full.isOpen)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(snapshots[3].full.couponCode).toBe("SAVE");
    expect(snapshots[4].full.couponSource).not.toBeNull();
    expect(snapshots[5].full.couponSource).toBeNull();
    expect(first.full.isHydrated).toBe(false);
    expect(snapshots[6].full.isHydrated).toBe(true);
    expect(markup).toBe("<output>0</output>");
  });

  it("changes the value/count for item changes, not duplicates or same-count replacement", () => {
    const second = { ...product, id: "second" };
    const { snapshots, markup } = sequence([
      (value) => value.addItem(product),
      (value) => value.addItem(product),
      (value) => value.addItem(second),
      (value) => value.removeItem(product.id),
      // A stored replacement changes items but not the header's count.
      () => {
        vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([{ product, quantity: 1 }]));
        probe.effects[0]();
      },
      (value) => value.clearCart(),
    ]);
    expect(snapshots.map(({ header }) => header.totalItems)).toEqual([0, 1, 1, 2, 1, 1, 0]);
    for (const index of [1, 3, 4, 6]) {
      expect(snapshots[index].header).not.toBe(snapshots[index - 1].header);
    }
    for (const index of [2, 5]) {
      expect(snapshots[index].header).toBe(snapshots[index - 1].header);
    }
    expect(snapshots[2].full.items).toBe(snapshots[1].full.items);
    expect(snapshots[5].full.items).not.toBe(snapshots[4].full.items);
    expect(snapshots[5].full.items[0].product.id).toBe(product.id);
    expect(snapshots.every(({ header, full }) => header.setIsOpen === full.setIsOpen)).toBe(true);
    expect(probe.capture).toHaveBeenCalledTimes(3);
    expect(markup).toBe("<output>0</output>");
  });

  it("publishes stored item counts on hydration and preserves provider children", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([{ product, quantity: 1 }]));
    const { snapshots, markup } = sequence([() => probe.effects[0]()]);
    expect(snapshots.map(({ header }) => header.totalItems)).toEqual([0, 1]);
    expect(snapshots[1].header).not.toBe(snapshots[0].header);
    expect(snapshots[1].full.isHydrated).toBe(true);
    expect(markup).toBe("<output>1</output>");
  });

  it("reads the dedicated context without depending on the full-cart provider", () => {
    function HeaderOnly() {
      return <output>{cart.useCartHeader().totalItems}</output>;
    }
    function WithoutFullContext() {
      const tree = cart.CartProvider({ children: <HeaderOnly /> });
      // Keep only the inner header provider: a full-cart subscription would throw.
      return tree.props.children;
    }
    expect(renderToStaticMarkup(<WithoutFullContext />)).toBe("<output>0</output>");
  });

  it("rejects useCartHeader outside CartProvider without changing useCart's guard", () => {
    function OutsideHeader() {
      cart.useCartHeader();
      return null;
    }
    function OutsideFull() {
      cart.useCart();
      return null;
    }
    expect(() => renderToStaticMarkup(<OutsideHeader />)).toThrow(
      "useCartHeader must be used inside <CartProvider>",
    );
    expect(() => renderToStaticMarkup(<OutsideFull />)).toThrow(
      "useCart must be used inside <CartProvider>",
    );
  });
});
