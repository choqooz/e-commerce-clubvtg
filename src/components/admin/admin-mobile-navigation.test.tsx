import Link from "next/link";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminMobileNavigation, AdminSidebar } from "./sidebar";

// Hook/element contracts only: no installed jsdom/happy-dom, no mounted Radix or AT claim.
const probe = vi.hoisted(() => ({
  pathname: "/admin/products",
  state: undefined as unknown,
  effects: [] as (() => void | (() => void))[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    if (probe.state === undefined) probe.state = initial;
    return [
      probe.state,
      (value: unknown) => {
        probe.state = typeof value === "function" ? value(probe.state) : value;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void)) => probe.effects.push(effect),
}));
vi.mock("next/navigation", () => ({ usePathname: () => probe.pathname }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: () => null,
  SheetTrigger: () => null,
  SheetContent: () => null,
  SheetTitle: () => null,
  SheetClose: () => null,
}));
type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
function descendants(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
}
const element = (tree: ReactNode, type: unknown) =>
  descendants(tree).find((node) => node.type === type)!;
const links = (tree: ReactNode) => descendants(tree).filter((node) => node.type === Link);
const render = () => {
  probe.effects = [];
  return AdminMobileNavigation();
};
const changeOpen = (tree: ReactNode, open: boolean) =>
  (element(tree, Sheet).props.onOpenChange as (value: boolean) => void)(open);
const closeFocus = (tree: ReactNode) => {
  const event = { preventDefault: vi.fn() };
  (element(tree, SheetContent).props.onCloseAutoFocus as (event: unknown) => void)(event);
  return event;
};
let desktop: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  probe.pathname = "/admin/products";
  probe.state = undefined;
  desktop = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("window", { matchMedia: vi.fn(() => desktop) });
});
afterEach(() => vi.unstubAllGlobals());

describe("Existing admin mobile navigation (shallow contracts, not mounted accessibility)", () => {
  it("offers a visible mobile header, named 44px controls and a titled left Sheet", () => {
    const tree = render();
    expect(tree.type).toBe("header");
    expect(tree.props.className).toContain("md:hidden");
    expect(tree.props.className).not.toContain("hidden md:");
    expect(element(tree, Sheet).props.open).toBe(false);
    expect(element(tree, SheetTrigger).props.asChild).toBe(true);
    expect(element(tree, SheetClose).props.asChild).toBe(true);
    expect(element(tree, SheetContent).props).toMatchObject({
      side: "left",
      showCloseButton: false,
      "aria-describedby": undefined,
    });
    expect(element(tree, SheetContent).props.className).toContain("overflow-y-auto");
    expect(element(tree, SheetTitle).props.children).toBe("Administración");
    for (const label of ["Abrir menú de administración", "Cerrar menú de administración"]) {
      const control = descendants(tree).find((node) => node.props["aria-label"] === label)!;
      expect(control.type).toBe("button");
      expect(control.props.type).toBe("button");
      expect(control.props.className).toContain("min-h-[44px]");
      expect(control.props.className).toContain("min-w-[44px]");
      expect(control.props.className).toContain("focus-visible:outline-2");
    }
    expect(
      links(tree).map((node) => [
        node.props.href,
        Children.toArray(node.props.children)
          .filter((child) => typeof child === "string")
          .join(""),
      ]),
    ).toEqual([
      ["/admin", "Dashboard"],
      ["/admin/products", "Productos"],
      ["/admin/orders", "Órdenes"],
      ["/admin/coupons", "Cupones"],
      ["/", "Volver a la tienda"],
    ]);
  });

  it.each([
    "/admin",
    "/admin/products",
    "/admin/products/new",
    "/admin/orders/one",
    "/admin/coupons",
    "/admin/products-extra",
  ])("has at most one active section on both surfaces: %s", (pathname) => {
    probe.pathname = pathname;
    const expected =
      pathname === "/admin"
        ? "/admin"
        : ["/admin/products", "/admin/orders", "/admin/coupons"].find(
            (href) => pathname === href || pathname.startsWith(`${href}/`),
          );
    for (const tree of [render(), AdminSidebar()]) {
      const active = links(tree).filter((node) => node.props["aria-current"] === "page");
      expect(active.map((node) => node.props.href)).toEqual(expected ? [expected] : []);
      expect(
        links(tree).some(
          (node) => node.props.href === "/" && node.props.children === "Volver a la tienda",
        ),
      ).toBe(true);
    }
  });

  it.each(["/admin", "/admin/products", "/admin/orders", "/admin/coupons", "/"])(
    "closes on link activation, including current route and shop exit: %s",
    (href) => {
      let tree = render();
      changeOpen(tree, true);
      tree = render();
      expect(element(tree, Sheet).props.open).toBe(true);
      const link = links(tree).find((node) => node.props.href === href)!;
      (link.props.onClick as () => void)();
      tree = render();
      expect(element(tree, Sheet).props.open).toBe(false);
      expect(closeFocus(tree).preventDefault).toHaveBeenCalledOnce();
    },
  );

  it("allows primitive dismissal to restore the trigger; reopening clears navigation intent", () => {
    let tree = render();
    changeOpen(tree, true);
    changeOpen(render(), false); // Shared primitive callback; not Escape/outside-event proof.
    tree = render();
    expect(element(tree, Sheet).props.open).toBe(false);
    expect(closeFocus(tree).preventDefault).not.toHaveBeenCalled();
    (links(tree)[0].props.onClick as () => void)();
    changeOpen(render(), true);
    changeOpen(render(), false);
    expect(closeFocus(render()).preventDefault).not.toHaveBeenCalled();
  });

  it("resets an open persistent layout on route change and does not reopen on back navigation", () => {
    changeOpen(render(), true);
    probe.pathname = "/admin/orders";
    expect(element(render(), Sheet).props.open).toBe(false);
    expect(element(render(), Sheet).props.open).toBe(false);
    probe.pathname = "/admin/products";
    expect(element(render(), Sheet).props.open).toBe(false);
    expect(element(render(), Sheet).props.open).toBe(false);
  });

  it("closes at the CSS desktop breakpoint, redirects focus to desktop and cleans its listener", () => {
    let tree = render();
    const cleanup = probe.effects[0]() as () => void;
    const callback = desktop.addEventListener.mock.calls[0][1] as () => void;
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 48rem)");
    changeOpen(tree, true);
    callback();
    expect(element(render(), Sheet).props.open).toBe(true); // Mobile media change is not dismissal.
    desktop.matches = true;
    callback();
    tree = render();
    expect(element(tree, Sheet).props.open).toBe(false);
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));
    vi.stubGlobal("document", { querySelector: vi.fn(() => ({ querySelector })) });
    expect(closeFocus(tree).preventDefault).toHaveBeenCalledOnce();
    expect(querySelector).toHaveBeenCalledWith('a[aria-current="page"]');
    expect(focus).toHaveBeenCalledOnce();
    desktop.matches = false;
    callback();
    expect(element(render(), Sheet).props.open).toBe(false);
    cleanup();
    expect(desktop.removeEventListener).toHaveBeenCalledWith("change", callback);
  });
});
