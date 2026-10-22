import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Swiper } from "swiper/react";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { CATEGORIES, formatPrice } from "@/lib/config";
import { COLOR_MAP } from "@/lib/constants";
import { navigateCatalogSearch } from "@/lib/catalog-search";

type CatalogSnapshot = import("./catalog-url-state").CatalogSnapshot;

// Shallow hooks/SSR only. Effects and callbacks run explicitly against mocks, never live services.
const probe = vi.hoisted(() => ({
  signedIn: false,
  userId: "user-test",
  clerk: { openSignIn: vi.fn(), openUserProfile: vi.fn(), signOut: vi.fn() },
  pathname: "/admin",
  states: [] as unknown[],
  stateIndex: 0,
  catalogHooks: false,
  adminHooks: false,
  serverRender: false,
  refIndex: 0,
  refs: [] as { current: unknown }[],
  store: null as null | {
    subscribe: (callback: () => void) => () => void;
    snapshot: () => CatalogSnapshot;
    serverSnapshot: () => CatalogSnapshot;
  },
  setState: vi.fn(),
  effects: [] as (() => void | (() => void))[],
  cart: {
    items: [] as { product: Product; quantity: number }[],
    totalItems: 0,
    totalPrice: 0,
    couponCode: "",
    isOpen: false,
    setIsOpen: vi.fn(),
    removeItem: vi.fn(),
    setCouponCode: vi.fn(),
    addItem: vi.fn(),
  },
  capture: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = probe.stateIndex++;
    if (!probe.catalogHooks && !probe.adminHooks)
      return [index < probe.states.length ? probe.states[index] : initial, probe.setState];
    if (index >= probe.states.length) probe.states[index] = initial;
    return [
      probe.states[index],
      (value: unknown) => {
        probe.setState(value);
        probe.states[index] = typeof value === "function" ? value(probe.states[index]) : value;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    probe.effects.push(effect);
  },
  useId: () => "shipping-pause-instruction",
  useRef: (initial: unknown) => {
    if (!probe.catalogHooks) return { current: initial };
    const index = probe.refIndex++;
    return probe.refs[index] ?? (probe.refs[index] = { current: initial });
  },
  useSyncExternalStore: (
    subscribe: (callback: () => void) => () => void,
    snapshot: () => CatalogSnapshot,
    serverSnapshot: () => CatalogSnapshot,
  ) => {
    probe.store = { subscribe, snapshot, serverSnapshot };
    return probe.serverRender ? serverSnapshot() : snapshot();
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: probe.signedIn, userId: probe.signedIn ? probe.userId : null }),
  useClerk: () => probe.clerk,
  SignInButton: ({ children, mode }: { children: ReactNode; mode: string }) => (
    <div data-mode={mode}>{children}</div>
  ),
  UserButton: Object.assign(
    ({ children }: { children: ReactNode }) => <div data-clerk="user">{children}</div>,
    {
      MenuItems: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Link: ({ href, label, labelIcon }: { href: string; label: string; labelIcon: ReactNode }) => (
        <a href={href}>
          {labelIcon}
          {label}
        </a>
      ),
      Action: ({ label }: { label: string }) => <button data-action={label}>{label}</button>,
    },
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => probe.pathname }));
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    sizes,
  }: {
    src: string;
    alt: string;
    className?: string;
    sizes?: string;
  }) => <img src={src} alt={alt} className={className} sizes={sizes} />,
}));
vi.mock("@/contexts/cart-context", () => ({
  useCart: () => probe.cart,
  useCartHeader: () => ({ totalItems: probe.cart.totalItems, setIsOpen: probe.cart.setIsOpen }),
}));
vi.mock("@/lib/actions/credits", () => ({ getUserCredits: vi.fn() }));
vi.mock("@/contexts/analytics-context", () => ({
  useAnalytics: () => ({ capture: probe.capture }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/sheet", () => {
  const surface = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  return Object.fromEntries(
    [
      "Sheet",
      "SheetContent",
      "SheetTrigger",
      "SheetHeader",
      "SheetTitle",
      "SheetFooter",
      "SheetClose",
    ].map((name) => [name, surface]),
  );
});
import { BrandMark } from "./brand-mark";
import { ProductGallery } from "./product-gallery";
import { SiteHeader } from "./site-header";
import { StorefrontContentTransition, StorefrontLink } from "./storefront-transition";
import { SiteFooter } from "./site-footer";
import { AdminMobileNavigation, AdminSidebar } from "./admin/sidebar";
import { CatalogContent } from "./catalog-content";
import { CollectionEditorial } from "./collection-editorial";
import { ProductDetailContent } from "./product-detail-content";
import { CartDrawer } from "./cart-drawer";
import { ProductCard } from "./product-card";
import { CatalogFilters, EMPTY_FILTERS } from "./catalog-filters";
import { CategoryBanner } from "./category-banner";
import { TryOnSection } from "./try-on-section";
import { Sheet } from "./ui/sheet";
import { getUserCredits } from "@/lib/actions/credits";
import { toast } from "sonner";

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [
          child as Element,
          ...descendants(
            child.type === CollectionEditorial
              ? CollectionEditorial(child.props as Parameters<typeof CollectionEditorial>[0])
              : (child as Element).props.children,
          ),
        ]
      : [],
  );
const elements = (tree: ReactNode, type: unknown) =>
  descendants(tree).filter((child) => child.type === type);
const button = (tree: ReactNode, label: string) =>
  (elements(tree, "button").find((child) => child.props["aria-label"] === label) ??
    elements(tree, "button").find(
      (child) => renderToStaticMarkup(<>{child.props.children}</>) === label,
    ))!;
const click = (element: Element) => (element.props.onClick as () => void)();
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const detail = (product = garment, relatedProducts: Product[] = []) =>
  ProductDetailContent({ product, relatedProducts });
const garment: Product = {
  id: "garment-1",
  slug: "camisa-vintage",
  title: "Camisa vintage",
  description: "Lino natural\nPieza original",
  price: 10000,
  current_price: 8000,
  promotion_percent: 20,
  promotion_ends_at: "2026-08-30T12:00:00Z",
  size: "M",
  color: "Azul, Multicolor, Desconocido",
  category: "hombre",
  subcategory: "camisas",
  brand: "Original",
  condition: "Muy bueno",
  measurements: "50 × 70 cm",
  image_urls: ["/shirt-front.jpg", "/shirt-back.jpg"],
  status: "available",
  reserved_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  product_type_id: null,
  product_subtype_id: null,
};
const second: Product = {
  ...garment,
  id: "garment-2",
  slug: "otra-camisa",
  category: "mujer",
  size: "S",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(probe, {
    signedIn: false,
    userId: "user-test",
    pathname: "/admin",
    states: [],
    stateIndex: 0,
    catalogHooks: false,
    adminHooks: false,
    serverRender: false,
    refIndex: 0,
    refs: [],
    store: null,
    effects: [],
  });
  Object.assign(probe.cart, {
    items: [],
    totalItems: 0,
    totalPrice: 0,
    couponCode: "",
    isOpen: false,
  });
  vi.mocked(getUserCredits).mockResolvedValue({ credits: 7 } as Awaited<
    ReturnType<typeof getUserCredits>
  >);
});

afterEach(() => vi.unstubAllGlobals());

// In-memory history and explicit shallow retries; no DOM mount, Next router or service runs.
function catalogBrowser(initial = "/?tag=one&tag=two&keep=1") {
  const events = new EventTarget();
  const entries = [new URL(initial, "https://store.example")];
  let index = 0;
  const location = { pathname: "", search: "", hash: "" };
  const sync = () =>
    Object.assign(location, {
      pathname: entries[index].pathname,
      search: entries[index].search,
      hash: entries[index].hash,
    });
  sync();
  const pushState = vi.fn((_state: unknown, _title: string, url: string) => {
    entries.splice(index + 1);
    entries.push(new URL(url, entries[index]));
    index++;
    sync();
  });
  const move = (offset: number) => {
    index += offset;
    sync();
    events.dispatchEvent(new Event("popstate"));
  };
  const focus = vi.fn();
  const scrollIntoView = vi.fn();
  const frames: (() => void)[] = [];
  vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus, scrollIntoView })) });
  vi.stubGlobal("window", {
    location,
    history: { pushState },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    cancelAnimationFrame: vi.fn(),
    matchMedia: () => ({ matches: false }),
  });
  return {
    location,
    pushState,
    events,
    back: () => move(-1),
    forward: () => move(1),
    frames,
    focus,
    scrollIntoView,
  };
}
function renderCatalog(
  initialProducts: Product[],
  publicTypeNames: string[] = [],
  typesLoadError = false,
) {
  probe.catalogHooks = true;
  for (let attempt = 0; attempt < 5; attempt++) {
    probe.stateIndex = 0;
    probe.refIndex = 0;
    probe.effects = [];
    const before = probe.setState.mock.calls.length;
    const tree = CatalogContent({ initialProducts, publicTypeNames, typesLoadError });
    if (probe.setState.mock.calls.length === before) return tree;
  }
  throw new Error("Catalog state did not settle");
}
const catalogButton = (tree: ReactNode, label: string) =>
  descendants(tree).find(
    (element) =>
      element.props.onClick && html(element.props.children).replace(/<[^>]*>/g, "") === label,
  )!;
const chooseCollection = (tree: ReactNode, value: string) =>
  (elements(tree, "select")[0].props.onChange as (event: unknown) => void)({ target: { value } });

// Admin-only shallow retries model the persistent layout state, not mounted Radix behavior.
function renderAdminMobile() {
  probe.adminHooks = true;
  for (let attempt = 0; attempt < 5; attempt++) {
    probe.stateIndex = 0;
    probe.effects = [];
    const before = probe.setState.mock.calls.length;
    const tree = AdminMobileNavigation();
    if (probe.setState.mock.calls.length === before) return tree;
  }
  throw new Error("Admin navigation state did not settle");
}

describe("Navigation contracts", () => {
  it("snapshots only each semantic main, with header/cart/footer as live siblings", () => {
    catalogBrowser("/#catalog");
    for (const tree of [renderCatalog([garment]), detail()]) {
      const shell = Children.toArray(tree.props.children) as Element[];
      expect(shell.map((child) => child.type)).toEqual([
        SiteHeader,
        CartDrawer,
        StorefrontContentTransition,
        SiteFooter,
      ]);
      const boundary = shell[2];
      const main = boundary.props.children as Element;
      expect(main.type).toBe("main");
      expect(elements(main, SiteHeader)).toHaveLength(0);
      expect(elements(main, SiteFooter)).toHaveLength(0);
      expect(elements(main, CartDrawer)).toHaveLength(0);
      expect(elements(main, StorefrontContentTransition)).toHaveLength(0);
    }
  });

  it("routes the logo and both catalog presentations through scoped Next links", () => {
    const links = elements(SiteHeader(), StorefrontLink);
    expect(links.find((link) => link.props.href === "/")?.props["aria-label"]).toBe(
      "clubvtg — Inicio",
    );
    const catalogLinks = links.filter((link) => link.props.href === "/#catalog");
    expect(catalogLinks).toHaveLength(2);
    expect(catalogLinks[0].props.onNavigate).toBe(catalogLinks[1].props.onNavigate);
    expect(catalogLinks[0].props.onClick).toBeUndefined();
  });

  it("keeps announcement, wordmark, catalog, modal sign-in and zero-count cart", () => {
    const tree = SiteHeader();
    const markup = html(tree);
    for (const copy of ["clubvtg", "Catálogo", "Entrar", "Envío a todo el país · Correo Argentino"])
      expect(markup).toContain(copy);
    expect(markup).toContain('data-mode="modal"');
    expect(markup.match(/href="\/"/g)).toHaveLength(1);
    const home = elements(tree, StorefrontLink).find((anchor) => anchor.props.href === "/")!;
    expect(home.props["aria-label"]).toBe("clubvtg — Inicio");
    expect(elements(home, BrandMark)[0].props).toMatchObject({
      alt: "",
      className: "w-[120px] md:w-[180px]",
    });
    // This shallow Sheet mock includes both desktop and unmounted mobile JSX.
    const catalogLinks = elements(tree, StorefrontLink).filter(
      (anchor) => anchor.props.href === "/#catalog",
    );
    expect(catalogLinks).toHaveLength(2);
    expect(catalogLinks[1].props["aria-label"]).toBe("Catálogo");
    expect(catalogLinks[0].props.onNavigate).toBe(catalogLinks[1].props.onNavigate);
    expect(markup).not.toContain("<h1");
    expect(button(tree, "Buscar").props).toMatchObject({
      "aria-expanded": false,
      "aria-controls": "storefront-search",
    });
    expect(markup).not.toContain('data-clerk="user"');
    expect(elements(tree, "input")).toHaveLength(0);
    click(button(tree, "Buscar"));
    expect(probe.setState).toHaveBeenCalledWith(true);
    click(button(tree, "Carrito"));
    expect(probe.cart.setIsOpen).toHaveBeenCalledWith(true);
    expect(getUserCredits).not.toHaveBeenCalled();
  });

  it("scopes motion and closed-state inertness to the controlled mobile menu", () => {
    const menuContent = (tree: ReactNode) =>
      elements(tree, Sheet).find((node) => node.props.side === "left")!;
    const closed = SiteHeader();
    const content = menuContent(closed);
    expect(content.props.className).toContain("menuPanel");
    expect(content.props.overlayClassName).toContain("menuOverlay");
    expect(content.props.inert).toBe(true);
    expect(content.props.forceMount).toBeUndefined();
    expect(content.props["data-state"]).toBeUndefined(); // Radix owns presence state.
    const desktop = elements(closed, "nav").find((node) => node.props["aria-label"] === "Tienda")!;
    expect(desktop.props.className).not.toMatch(/menuPanel|menuOverlay|animate|transition/);
    // The cart relies on Sheet's default right side; the mock aliases all Sheet exports.
    const cartContent = elements(CartDrawer(), Sheet).find((node) => node.props.onCloseAutoFocus)!;
    expect(cartContent.props.className).toContain("cartPanel");
    expect(cartContent.props.className).not.toContain("menuPanel");
    expect(cartContent.props.overlayClassName).toContain("cartOverlay");
    expect(cartContent.props.inert).toBe(true);
    const adminContent = elements(AdminMobileNavigation(), Sheet).find(
      (node) => node.props.side === "left",
    )!;
    expect(adminContent.props.overlayClassName).toBeUndefined();
    expect(adminContent.props.className).not.toMatch(/cartPanel|menuPanel/);

    // Explicit shallow state sequence, not mounted presence, focus or animation evidence.
    for (const open of [true, false, true, false]) {
      probe.states = [false, open];
      probe.stateIndex = 0;
      expect(menuContent(SiteHeader()).props.inert).toBe(!open);
    }
  });

  it("submits the expandable search, restores its URL value and clears without dropping category", () => {
    const browser = catalogBrowser("/?category=tops&q=Lino&keep=1#catalog");
    probe.states = [true];
    let tree = SiteHeader();
    const input = elements(tree, "input")[0];
    expect(input.props).toMatchObject({
      type: "search",
      name: "q",
      value: "Lino",
      placeholder: "Buscar prendas...",
      autoFocus: true,
    });
    const form = elements(tree, "form")[0];
    expect(form.props).toMatchObject({ role: "search", "aria-label": "Buscar prendas" });
    const event = {
      preventDefault: vi.fn(),
      currentTarget: { elements: { namedItem: vi.fn(() => ({ value: "  ORIGINAL  " })) } },
    };
    (form.props.onSubmit as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(browser.location.search).toBe("?category=tops&q=ORIGINAL&keep=1");
    probe.stateIndex = 0;
    tree = SiteHeader();
    expect(elements(tree, "input")[0].props.value).toBe("ORIGINAL");
    expect(
      elements(tree, StorefrontLink).filter((link) => link.props.href === "/?q=ORIGINAL#catalog"),
    ).toHaveLength(2);
    click(button(tree, "Limpiar búsqueda"));
    expect(browser.location.search).toBe("?category=tops&keep=1");
    click(button(tree, "Buscar"));
    expect(probe.setState).toHaveBeenCalledWith(false);
  });

  it("submits search from another page to the catalog without copying page-specific parameters", () => {
    catalogBrowser("/orders?page=2");
    const assign = vi.fn();
    Object.assign(window.location, { assign });
    probe.states = [true];
    const tree = SiteHeader();
    (elements(tree, "form")[0].props.onSubmit as (event: unknown) => void)({
      preventDefault: vi.fn(),
      currentTarget: { elements: { namedItem: () => ({ value: "  camisa  " }) } },
    });
    expect(assign).toHaveBeenCalledWith("/?q=camisa#catalog");
  });

  it("preserves signed-in Clerk menu and loaded credits with mocked effect only", async () => {
    probe.signedIn = true;
    probe.states = [false, false, { userId: probe.userId, credits: 7 }];
    probe.cart.totalItems = 3;
    const markup = html(SiteHeader());
    for (const path of ["/profile", "/orders", "/credits"])
      expect(markup).toContain(`href="${path}"`);
    for (const label of ["Mi Perfil", "Mis Pedidos", "Créditos", "manageAccount", "signOut"])
      expect(markup).toContain(label);
    expect(markup).not.toContain("Entrar");
    expect(markup).toContain(">7</span>");
    expect(markup).toContain(">3</span>");
    expect(getUserCredits).not.toHaveBeenCalled();
    probe.effects[0]();
    await Promise.resolve();
    expect(getUserCredits).toHaveBeenCalledOnce();
    expect(probe.setState).toHaveBeenCalledWith({ userId: probe.userId, credits: 7 });
  });

  it("retains footer destinations, shipping copy, brand text and current year", () => {
    const markup = html(SiteFooter());
    for (const path of ["/", "/#catalog", "/credits", "mailto:choqooz@gmail.com"])
      expect(markup).toContain(`href="${path}"`);
    expect(markup).toContain(`${new Date().getFullYear()} clubvtg. Todos los derechos reservados.`);
    expect(markup).toContain("Envíos a todo el país · Correo Argentino");
    expect(markup).toContain("Cada pieza tiene una historia.");
    const home = elements(SiteFooter(), "a").find((anchor) => anchor.props.href === "/")!;
    expect(home.props["aria-label"]).toBe("clubvtg — Inicio");
    expect(elements(home, BrandMark)[0].props).toMatchObject({
      alt: "",
      className: "w-[120px] md:w-full md:max-w-[420px]",
    });
  });

  it("keeps the complete admin mark separate from its Admin label on both presentations", () => {
    const desktop = AdminSidebar();
    const mobile = AdminMobileNavigation();
    const home = descendants(desktop).find(
      (node) => node.props["aria-label"] === "clubvtg — Inicio",
    )!;
    expect(home.props.href).toBe("/");
    expect(elements(home, BrandMark)[0].props).toMatchObject({ alt: "", className: "w-[120px]" });
    expect(elements(mobile, BrandMark)[0].props).toEqual({ className: "w-[120px]" });
    for (const tree of [desktop, mobile]) {
      expect(elements(tree, "span").some((node) => node.props.children === "Admin")).toBe(true);
      expect(html(tree)).toContain("/branding/clubvtg/clubvtg-horizontal-black.svg");
      expect(html(tree)).not.toContain("<h1");
    }
  });

  it.each([
    "/admin",
    "/admin/products",
    "/admin/products/new",
    "/admin/orders",
    "/admin/coupons",
    "/admin/products-extra",
  ])("keeps exact and descendant active rules for %s", (pathname) => {
    probe.pathname = pathname;
    const tree = AdminSidebar();
    const markup = html(tree);
    expect((tree as Element).props.className).toContain("hidden");
    expect((tree as Element).props.className).toContain("md:flex");
    expect(elements(tree, "nav")[0].props["aria-label"]).toBe("Navegación de administración");
    const active = descendants(tree).filter((child) => child.props["aria-current"] === "page");
    const expected =
      pathname === "/admin"
        ? "/admin"
        : ["/admin/products", "/admin/orders", "/admin/coupons"].find(
            (href) => pathname === href || pathname.startsWith(`${href}/`),
          );
    expect(active.map((anchor) => anchor.props.href)).toEqual(expected ? [expected] : []);
    const shopExit = descendants(tree).find(
      (child) => child.props.href === "/" && child.props.children === "Volver a la tienda",
    )!;
    expect(shopExit).toBeDefined();
    expect(shopExit.props["aria-current"]).toBeUndefined();
    for (const [href, title] of [
      ["/admin", "Dashboard"],
      ["/admin/products", "Productos"],
      ["/admin/orders", "Órdenes"],
      ["/admin/coupons", "Cupones"],
    ]) {
      const anchor = descendants(tree).find((child) => child.props.href === href)!;
      expect(anchor.props.className!.includes("bg-warm-sand")).toBe(
        pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)),
      );
      expect(anchor.props["aria-current"]).toBe(href === expected ? "page" : undefined);
      expect(markup).toContain(title);
    }
  });

  it("keeps the admin mobile menu named, controlled and closed after navigation or shop exit", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
    probe.pathname = "/admin/products/new";
    let tree = renderAdminMobile();
    expect(tree.type).toBe("header");
    expect(tree.props.className).toContain("md:hidden");
    expect(button(tree, "Abrir menú de administración").props.type).toBe("button");
    expect(button(tree, "Cerrar menú de administración").props.type).toBe("button");
    const sheet = () => elements(tree, Sheet).find((node) => node.props.onOpenChange)!;
    const content = () => elements(tree, Sheet).find((node) => node.props.side === "left")!;
    const changeOpen = (open: boolean) =>
      (sheet().props.onOpenChange as (value: boolean) => void)(open);
    expect(sheet().props.open).toBe(false);
    expect(content().props["aria-describedby"]).toBeUndefined();
    expect(html(content())).toContain("Administración");
    expect(elements(tree, "nav")[0].props["aria-label"]).toBe("Navegación móvil de administración");
    expect(
      descendants(tree)
        .filter((node) => node.props["aria-current"] === "page")
        .map((node) => node.props.href),
    ).toEqual(["/admin/products"]);
    for (const href of ["/admin", "/admin/products", "/admin/orders", "/admin/coupons", "/"]) {
      changeOpen(true);
      tree = renderAdminMobile();
      expect(sheet().props.open).toBe(true);
      const link = descendants(tree).find((node) => node.props.href === href)!;
      if (href === "/") expect(link.props.children).toBe("Volver a la tienda");
      click(link);
      tree = renderAdminMobile();
      expect(sheet().props.open).toBe(false);
      const event = { preventDefault: vi.fn() };
      (content().props.onCloseAutoFocus as (value: unknown) => void)(event);
      expect(event.preventDefault).toHaveBeenCalledOnce(); // Mock callback, not focus proof.
    }
    changeOpen(true);
    tree = renderAdminMobile();
    probe.pathname = "/admin/orders";
    tree = renderAdminMobile();
    expect(sheet().props.open).toBe(false);
    probe.pathname = "/admin/products/new";
    tree = renderAdminMobile();
    expect(sheet().props.open).toBe(false);
  });
});

describe("Storefront state, data and callback preservation", () => {
  const publicNames = [
    "Camisas",
    "Sin prendas",
    "ropa única 👕",
    "all",
    "home",
    "__proto__",
    "tops",
    "legacy:tops",
    "  Lino  ",
  ];

  it("composes entry and shared chrome on passive home, then mounts filters/cards only in collection", () => {
    const browser = catalogBrowser();
    const products = [garment, second];
    const before = JSON.stringify(products);
    let tree = renderCatalog(products);
    expect(elements(tree, SiteHeader)).toHaveLength(1);
    expect(elements(tree, SiteFooter)).toHaveLength(1);
    expect(elements(tree, CartDrawer)).toHaveLength(1);
    expect(elements(tree, CategoryBanner)[0].props.initialProducts).toBe(products);
    expect(elements(tree, ProductCard)).toHaveLength(0);
    expect(elements(tree, CatalogFilters)).toHaveLength(0);
    const target = elements(tree, "section").find((section) => section.props.id === "catalog")!;
    expect(target.props).toMatchObject({
      hidden: true,
      tabIndex: -1,
      "aria-label": "Catálogo de prendas",
    });
    probe.effects[0]();
    expect(browser.frames).toHaveLength(0); // Ordinary home never steals focus.
    const all = button(tree, "Ver todas las prendas");
    expect(all.props).toMatchObject({ type: "button", "aria-controls": "catalog" });
    click(all);
    tree = renderCatalog(products);
    expect(elements(tree, CategoryBanner)).toHaveLength(0);
    expect(elements(tree, "aside")).toHaveLength(0);
    expect(elements(tree, "nav")).toHaveLength(0); // Compact select replaces the old tabs.
    expect(elements(tree, "select")[0].props).toMatchObject({
      id: "collection-category",
      value: "all",
    });
    expect(elements(tree, "label")[0].props.htmlFor).toBe("collection-category");
    expect(
      elements(tree, ProductCard).map((card) => [card.props.product, card.props.priority]),
    ).toEqual([
      [garment, true],
      [second, false],
    ]);
    expect(elements(tree, CatalogFilters)).toHaveLength(1);
    // The preserved Sheet mock aliases every export to one function; identify its direct right content.
    const filterSheets = elements(tree, Sheet).filter((sheet) =>
      Children.toArray(sheet.props.children).some(
        (child) => isValidElement(child) && (child as Element).props.side === "right",
      ),
    );
    expect(filterSheets).toHaveLength(1); // One sheet at every viewport, not duplicated filters.
    expect(elements(tree, CatalogFilters)[0].props).toMatchObject({
      filters: EMPTY_FILTERS,
      categoryProducts: products,
    });
    const changeFilters = elements(tree, CatalogFilters)[0].props.onFiltersChange as (
      value: unknown,
    ) => void;
    changeFilters(EMPTY_FILTERS);
    expect(probe.setState).toHaveBeenCalledWith(EMPTY_FILTERS);
    expect(html(tree)).toContain("2 prendas encontradas");
    expect(JSON.stringify(products)).toBe(before);
  });

  it("combines search with category/filters and restores query through clear, category and history", () => {
    const browser = catalogBrowser("/?category=tops&q=LiNo&keep=1#catalog");
    const top = { ...garment, category: "tops" };
    const otherSize = { ...top, id: "small", size: "S" };
    const bottom = { ...top, id: "bottom", category: "bottoms" };
    const products = [top, otherSize, bottom];
    const filters = { ...EMPTY_FILTERS, sizes: ["M"], subcategory: "camisas" };
    probe.states = ["type:tops", filters];
    let tree = renderCatalog(products, ["tops", "bottoms"]);
    const cleanup = probe.store!.subscribe(() => {
      tree = renderCatalog(products, ["tops", "bottoms"]);
    });
    expect(elements(tree, ProductCard).map((card) => card.props.product)).toEqual([top]);
    expect(html(tree)).toContain("1 prenda encontrada para “LiNo”");
    expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toEqual([top, otherSize]);
    // Changing only query must not trigger the category's subcategory reset.
    // The header owns the sole clear control; the collection responds to the shared URL event.
    expect(catalogButton(tree, "Limpiar búsqueda")).toBeUndefined();
    navigateCatalogSearch("");
    expect(browser.location.search).toBe("?category=tops&keep=1");
    expect(probe.states[1]).toBe(filters);
    browser.back();
    expect(html(tree)).toContain("para “LiNo”");
    chooseCollection(tree, "type:bottoms");
    expect(browser.location.search).toContain("q=LiNo");
    expect(elements(tree, ProductCard).map((card) => card.props.product)).toEqual([bottom]);
    expect(probe.states[1]).toEqual({ ...filters, subcategory: null });
    click(catalogButton(tree, "Limpiar filtros"));
    tree = renderCatalog(products, ["tops", "bottoms"]);
    expect(browser.location.search).toContain("q=LiNo");
    click(catalogButton(tree, "Volver al inicio"));
    expect(elements(tree, CategoryBanner)).toHaveLength(1);
    expect(browser.location.search).toBe("?q=LiNo&keep=1");
    browser.back();
    expect(elements(tree, "select")[0].props.value).toBe("type:bottoms");
    cleanup();
  });

  it("shows a search-specific empty state and clears only the query to recover scoped results", () => {
    const browser = catalogBrowser("/?category=tops&q=inexistente#catalog");
    const product = { ...garment, category: "tops" };
    probe.states = ["type:tops", { ...EMPTY_FILTERS, sizes: ["M"] }];
    let tree = renderCatalog([product], ["tops"]);
    expect(elements(tree, ProductCard)).toHaveLength(0);
    expect(html(tree)).toContain("0 prendas encontradas para “inexistente”");
    expect(html(tree)).toContain(
      "No encontramos prendas para esta búsqueda con la categoría y los filtros actuales.",
    );
    expect(catalogButton(tree, "Limpiar búsqueda")).toBeUndefined();
    navigateCatalogSearch("");
    tree = renderCatalog([product], ["tops"]);
    expect(browser.location.search).toBe("?category=tops");
    expect(elements(tree, ProductCard)[0].props.product).toBe(product);
    expect(html(tree)).toContain("Filtros (1)");
  });

  it("retains category narrowing, subcategory-only reset, active count, clear and empty state", () => {
    catalogBrowser("/?category=tops#catalog");
    const top = { ...garment, category: "tops" };
    const bottom = { ...second, category: "bottoms" };
    const filters = { ...EMPTY_FILTERS, subcategory: "camisas", sizes: ["M"] };
    probe.states = ["legacy:tops", filters];
    let tree = renderCatalog([top, bottom]);
    expect(elements(tree, ProductCard).map((card) => card.props.product)).toEqual([top]);
    expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toEqual([top]);
    expect(html(tree)).toContain("1 prenda encontrada");
    expect(html(tree)).toContain("Filtros (2)");
    chooseCollection(tree, "legacy:tops");
    const updater = probe.setState.mock.calls.find(([value]) => typeof value === "function")![0];
    expect(updater(filters)).toEqual({ ...filters, subcategory: null });
    tree = renderCatalog([top, bottom]);
    click(catalogButton(tree, "Limpiar filtros"));
    expect(probe.setState).toHaveBeenCalledWith(EMPTY_FILTERS);
    tree = renderCatalog([top, bottom]);
    expect(elements(tree, CatalogFilters)[0].props.filters).toBe(EMPTY_FILTERS);
    probe.states = ["legacy:tops", { ...EMPTY_FILTERS, sizes: ["XXL"] }];
    const empty = renderCatalog([top]);
    expect(elements(empty, ProductCard)).toHaveLength(0);
    expect(html(empty)).toContain("No encontramos prendas con estos filtros.");
    expect(html(empty)).toContain("Limpiar filtros");
  });

  it.each(CATEGORIES)(
    "opens the configured entry $id with exact legacy product scope",
    ({ id }) => {
      const browser = catalogBrowser();
      const products = CATEGORIES.filter((category) => category.id !== "all").map((category) => ({
        ...garment,
        id: category.id,
        category: category.id,
      }));
      let tree = renderCatalog(products);
      (elements(tree, CategoryBanner)[0].props.onCategoryChange as (category: string) => void)(id);
      tree = renderCatalog(products);
      const selection = id === "all" ? "all" : `legacy:${id}`;
      expect(elements(tree, "select")[0].props.value).toBe(selection);
      expect(elements(tree, "option").map((option) => option.props.value)).toEqual(
        id === "all" ? ["all"] : ["all", selection],
      );
      const expected =
        id === "all" ? products : products.filter((product) => product.category === id);
      expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toEqual(expected);
      expect(
        elements(tree, ProductCard).map((card) => [card.props.product, card.props.priority]),
      ).toEqual(expected.map((product, index) => [product, index === 0]));
      expect(new URLSearchParams(browser.location.search).get("category")).toBe(
        id === "all" ? null : id,
      );
      expect(browser.location.hash).toBe("#catalog");
    },
  );

  it.each(publicNames)(
    "uses the complete public name list and exactly filters stored name %s",
    (name) => {
      const names = publicNames;
      const products = names
        .filter((name) => name !== "Sin prendas")
        .map((category) => ({
          ...garment,
          id: category,
          category,
        }));
      const browser = catalogBrowser(`/?category=${encodeURIComponent(name)}`);
      const tree = renderCatalog(products, [...names, "Camisas", "", " "]);
      const select = elements(tree, "select")[0];
      expect(select.props.value).toBe(`type:${name}`);
      expect(
        elements(select, "option").map((option) => [option.props.value, option.props.children]),
      ).toEqual([["all", "Todo"], ...names.map((name) => [`type:${name}`, name])]);
      expect(elements(select, "optgroup")).toHaveLength(0);
      const expected = products.filter((product) => product.category === name);
      expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toEqual(expected);
      expect(elements(tree, ProductCard).map((card) => card.props.product)).toEqual(expected);
      if (!expected.length)
        expect(html(tree)).toContain("No encontramos prendas con estos filtros.");
      expect(browser.pushState).not.toHaveBeenCalled();
    },
  );

  it.each(["unknown", "camisas", "", " ", "Camisas&category=Camisas"])(
    "opens Todo for invalid/case-mismatched/duplicate query %s",
    (value) => {
      catalogBrowser(`/?category=${value}`);
      const products = [garment, second];
      const tree = renderCatalog(products, ["Camisas"]);
      expect(elements(tree, "select")[0].props.value).toBe("all");
      expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toBe(products);
      expect(elements(tree, ProductCard)).toHaveLength(2);
    },
  );

  it.each([false, true])(
    "distinguishes the honest empty public list from load error %s",
    (error) => {
      catalogBrowser("/#catalog");
      const tree = renderCatalog([garment], [], error);
      expect(elements(tree, "option").map((option) => option.props.children)).toEqual(["Todo"]);
      expect(elements(tree, ProductCard)).toHaveLength(1);
      expect(html(tree)).toContain(
        error
          ? "No pudimos cargar las categorías. Intentá de nuevo más tarde."
          : "No hay categorías creadas disponibles.",
      );
      expect(html(tree)).not.toContain(
        error
          ? "No hay categorías creadas disponibles."
          : "No pudimos cargar las categorías. Intentá de nuevo más tarde.",
      );
    },
  );

  it("restores collection/history and foreign parameters while resetting only subcategory", () => {
    const browser = catalogBrowser("/?tag=one&tag=two&keep=1#catalog");
    const names = ["tops", "bottoms"];
    const products = [
      { ...garment, category: "tops" },
      { ...garment, id: "bottom", category: "bottoms", subcategory: "pantalones" },
    ];
    const filters = {
      ...EMPTY_FILTERS,
      subcategory: "camisas",
      sizes: ["M"],
      brands: ["Original"],
      colors: ["azul"],
      conditions: ["Muy bueno"],
      priceBracket: 0,
    };
    const before = JSON.stringify({ products, filters });
    probe.states = ["all", filters];
    let tree = renderCatalog(products, names);
    const onChange = vi.fn(() => {
      tree = renderCatalog(products, names);
    });
    const cleanup = probe.store!.subscribe(onChange);
    chooseCollection(tree, "type:tops");
    expect(elements(tree, CatalogFilters)[0].props.filters).toEqual({
      ...filters,
      subcategory: null,
    });
    expect(elements(tree, ProductCard)[0].props.product).toBe(products[0]);
    chooseCollection(tree, "type:bottoms");
    probe.states[1] = filters;
    browser.back();
    expect(elements(tree, "select")[0].props.value).toBe("type:tops");
    expect(elements(tree, CatalogFilters)[0].props.filters).toEqual({
      ...filters,
      subcategory: null,
    });
    browser.forward();
    expect(elements(tree, "select")[0].props.value).toBe("type:bottoms");
    expect(elements(tree, ProductCard)[0].props.product).toBe(products[1]);
    probe.states[1] = filters;
    tree = renderCatalog(products, names);
    const pushes = browser.pushState.mock.calls.length;
    chooseCollection(tree, "type:bottoms"); // Same selection still clears only subcategory.
    tree = renderCatalog(products, names);
    expect(probe.states[1]).toEqual({ ...filters, subcategory: null });
    expect(browser.pushState).toHaveBeenCalledTimes(pushes);
    probe.setState.mockClear();
    for (const value of ["tops", "type:missing", "legacy:tops", "legacy:bottoms", "legacy:all"])
      chooseCollection(tree, value);
    expect(probe.setState).not.toHaveBeenCalled();
    expect(browser.pushState).toHaveBeenCalledTimes(pushes);
    click(catalogButton(tree, "Volver al inicio"));
    expect(elements(tree, CategoryBanner)).toHaveLength(1);
    expect(browser.location).toEqual({
      pathname: "/",
      search: "?tag=one&tag=two&keep=1",
      hash: "",
    });
    expect(probe.states[1]).toEqual({ ...filters, subcategory: null });
    browser.back();
    expect(elements(tree, "select")[0].props.value).toBe("type:bottoms");
    browser.forward();
    expect(elements(tree, CategoryBanner)).toHaveLength(1);
    expect(JSON.stringify({ products, filters })).toBe(before);
    const calls = onChange.mock.calls.length;
    cleanup();
    browser.events.dispatchEvent(new Event("hashchange"));
    browser.events.dispatchEvent(new Event("popstate"));
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it("consumes the unchanged detail breadcrumb after an SSR-safe home snapshot", () => {
    const product = { ...garment, category: "tops" };
    const link = descendants(detail(product)).find(
      (element) => element.props.href === "/?category=tops",
    )!;
    expect(link).toBeDefined();
    vi.stubGlobal("window", undefined);
    probe.serverRender = true;
    const server = renderCatalog([product, second]);
    expect(elements(server, CategoryBanner)).toHaveLength(1);
    expect(elements(server, ProductCard)).toHaveLength(0);
    expect(probe.store!.serverSnapshot()).toBe("home");
    probe.effects[0](); // Passive server snapshot; not mounted hydration evidence.
    const browser = catalogBrowser(link.props.href as string);
    probe.serverRender = false;
    let client = renderCatalog([product, second], ["tops"]);
    expect(elements(client, "select")[0].props.value).toBe("type:tops");
    expect(elements(client, ProductCard)[0].props.product).toBe(product);
    click(catalogButton(client, "Volver al inicio"));
    client = renderCatalog([product, second], ["tops"]);
    (elements(client, CategoryBanner)[0].props.onCategoryChange as (category: string) => void)(
      "tops",
    );
    expect(probe.store!.snapshot()).toBe("type:tops"); // Created names win over colliding legacy IDs.
    expect(new URLSearchParams(browser.location.search).get("category")).toBe("tops");
  });

  it.each([false, true])(
    "requests collection focus/scroll with reduced motion %s against mocks",
    (reduced) => {
      const browser = catalogBrowser("/#catalog");
      window.matchMedia = vi.fn(() => ({
        matches: reduced,
      })) as unknown as typeof window.matchMedia;
      renderCatalog([]);
      const cancel = probe.effects[0]() as () => void;
      expect(browser.frames).toHaveLength(1);
      browser.frames[0]();
      expect(document.getElementById).toHaveBeenCalledWith("catalog");
      expect(browser.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(browser.scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: reduced ? "instant" : "smooth",
      });
      cancel();
      expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    },
  );

  it.each(["available", "reserved", "sold", "archived"] as const)(
    "keeps Card %s stock truth, slug link, promoted price and unchanged input",
    (status) => {
      const product = { ...garment, status };
      const before = JSON.stringify(product);
      const tree = ProductCard({ product, priority: true });
      const markup = html(tree);
      expect(markup).toContain(`href="/product/${product.slug}"`);
      expect(markup).toContain(formatPrice(product.current_price!));
      expect(markup).toContain(formatPrice(product.price));
      expect(markup).toContain("-20%");
      expect(markup).toContain('sizes="(min-width: 1024px) 25vw, 50vw"');
      expect(markup).toContain('src="/shirt-front.jpg"');
      expect(markup).not.toContain("shirt-back.jpg");
      const label = {
        available: null,
        reserved: "Reservado",
        sold: "Vendido",
        archived: "No disponible",
      }[status];
      if (label) expect(markup).toContain(label);
      else expect(markup).not.toMatch(/Reservado|Vendido|No disponible|En stock/);
      expect(JSON.stringify(product)).toBe(before);
      expect(probe.cart.addItem).not.toHaveBeenCalled();
    },
  );

  it.each(["available", "reserved", "sold", "archived"] as const)(
    "retains %s availability, feedback and add-cart guard",
    (status) => {
      const product = { ...garment, status };
      const tree = detail(product);
      const add = elements(tree, "button").find((element) => element.props.disabled !== undefined)!;
      expect(add.props.disabled).toBe(status !== "available");
      expect(html(add)).toContain(
        {
          available: "Agregar al carrito",
          reserved: "Reservado",
          sold: "Vendido",
          archived: "No Disponible",
        }[status],
      );
      click(add);
      if (status === "available") {
        expect(probe.cart.addItem).toHaveBeenCalledWith(product);
        expect(toast.success).toHaveBeenCalledWith("Agregado al carrito");
      } else {
        expect(probe.cart.addItem).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith("Este producto ya no está disponible");
      }
    },
  );

  it("retains money, Argentina promotion date, truthful media/swatches, gallery and related semantics", () => {
    const tree = detail(garment, [second]);
    const markup = html(tree);
    for (const copy of [
      garment.title,
      garment.description!,
      garment.brand!,
      garment.condition!,
      garment.measurements!,
      formatPrice(10000),
      formatPrice(8000),
      "Pieza única — talle único",
      "También te puede gustar",
    ])
      expect(markup).toContain(copy);
    const date = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "medium",
      hourCycle: "h23",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(garment.promotion_ends_at!));
    expect(markup).toContain(`-20% hasta ${date}`);
    expect(markup).toContain('href="/?category=hombre"');
    expect(elements(tree, TryOnSection)[0].props.productSlug).toBe(garment.slug);
    expect(markup).toContain(`href="/try-on/${garment.slug}"`);
    expect(elements(tree, ProductCard)[0].props.product).toBe(second);
    const swatches = descendants(tree).filter(
      (element) => element.props["aria-label"] && element.props.style,
    );
    expect(swatches.map((swatch) => [swatch.props["aria-label"], swatch.props.style])).toEqual([
      ["Azul", { backgroundColor: COLOR_MAP.azul }],
      ["Multicolor", { background: COLOR_MAP.multicolor }],
      ["Desconocido", { backgroundColor: "#cccccc" }],
    ]);
    // Invoke the extracted real gallery; retain the callback guard through Swiper's local API.
    const gallery = ProductGallery({ product: garment });
    const slider = elements(gallery, Swiper)[0];
    const instance = {
      activeIndex: 0,
      slideTo: vi.fn((index: number) => {
        instance.activeIndex = index;
        (slider.props.onSlideChange as (api: unknown) => void)(instance);
      }),
    };
    (slider.props.onSwiper as (api: unknown) => void)(instance);
    const thumbnails = elements(gallery, "button").filter(
      (element) => typeof element.props["aria-pressed"] === "boolean",
    );
    expect(thumbnails).toHaveLength(2);
    click(thumbnails[1]);
    expect(instance.slideTo).toHaveBeenCalledWith(1, 400);
    expect(probe.setState).toHaveBeenCalledWith(1);
    expect(markup).toContain('src="/shirt-front.jpg"');
    expect(markup).toContain('alt="Vista 2"');
    expect(probe.capture).not.toHaveBeenCalled();
    probe.effects[0]();
    expect(probe.capture).toHaveBeenCalledOnce();
  });

  it("keeps optional details, image fallback, zero current price and absent related products", () => {
    const markup = html(
      detail({
        ...garment,
        image_urls: [],
        color: null,
        size: null,
        brand: null,
        condition: null,
        measurements: null,
        description: null,
        subcategory: null,
        current_price: 0,
        promotion_percent: null,
        promotion_ends_at: null,
      }),
    );
    expect(markup).toContain(formatPrice(0));
    for (const copy of [
      "Vista 1",
      "Detalles Adicionales",
      "Pieza única",
      "También te puede gustar",
      "% hasta",
    ])
      expect(markup).not.toContain(copy);
    expect(markup).toContain("hombre");
  });

  it("preserves empty cart and controlled sheet without exposing checkout", () => {
    const tree = CartDrawer();
    expect((tree as Element).type).toBe(Sheet);
    expect((tree as Element).props).toMatchObject({
      open: false,
      onOpenChange: probe.cart.setIsOpen,
    });
    expect(html(tree)).toContain("Tu carrito está vacío");
    expect(html(tree)).not.toContain('href="/checkout"');
  });

  it("preserves item price, cart totals/count, image fallback, remove, coupon and checkout close callbacks", () => {
    Object.assign(probe.cart, {
      items: [
        { product: garment, quantity: 2 },
        { product: { ...second, image_urls: [] }, quantity: 1 },
      ],
      totalItems: 3,
      totalPrice: 30000,
      couponCode: "AHORRO20",
      isOpen: true,
    });
    const tree = CartDrawer();
    const markup = html(tree);
    expect((tree as Element).props.open).toBe(true);
    for (const copy of [
      "Carrito (3)",
      formatPrice(10000),
      formatPrice(30000),
      "Talle M",
      "Elegirás entre el cupón y las promociones antes de pagar.",
    ])
      expect(markup).toContain(copy);
    expect(markup).toContain('sizes="(min-width: 640px) 104px, 88px"');
    expect(markup).toContain('src="/shirt-front.jpg"');
    const input = elements(tree, "input")[0];
    expect(input.props).toMatchObject({
      id: "cart-coupon-code",
      value: "AHORRO20",
      placeholder: "Ingresalo para cotizarlo en checkout",
    });
    expect(elements(tree, "label")[0].props.htmlFor).toBe(input.props.id);
    (input.props.onChange as (event: unknown) => void)({ target: { value: "Nuevo" } });
    expect(probe.cart.setCouponCode).toHaveBeenCalledWith("Nuevo");
    click(button(tree, "Quitar producto"));
    expect(probe.cart.removeItem).toHaveBeenCalledWith(garment.id);
    const checkout = descendants(tree).find((element) => element.props.href === "/checkout")!;
    click(checkout);
    expect(probe.cart.setIsOpen).toHaveBeenCalledWith(false);
  });
});

// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "site-header.tsx",
  "site-footer.tsx",
  "admin/sidebar.tsx",
  "catalog-content.tsx",
  "product-card.tsx",
  "product-detail-content.tsx",
  "cart-drawer.tsx",
];
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function semanticNode(node: ts.Node): unknown {
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    children.push(semanticNode(child));
  });
  return [
    node.kind,
    ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      ? node.text
      : null,
    children,
  ];
}
function signatures(text: string, adminNavigation = false) {
  const file = parse(text);
  const attributes: string[] = [],
    copy: string[] = [],
    preambles: string[] = [];
  const print = (node: ts.Node) => JSON.stringify(semanticNode(node));
  const visit = (node: ts.Node) => {
    // Only the accepted admin delta is normalized; its full bytes are also pinned below.
    // Existing desktop destinations, copy and function preamble retain the fixed baseline.
    if (
      adminNavigation &&
      ((ts.isFunctionDeclaration(node) && node.name?.text === "AdminMobileNavigation") ||
        (ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(file) === "Link" &&
          node.children.some(
            (child) => ts.isJsxText(child) && child.text.trim() === "Volver a la tienda",
          )) ||
        (ts.isJsxAttribute(node) &&
          (node.name.getText(file) === "aria-current" ||
            node.getText(file) === 'aria-label="Navegación de administración"')))
    )
      return;
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) !== "className" &&
      !(node.name.getText(file) === "style" && node.getText(file).includes("animationDelay"))
    )
      attributes.push(print(node));
    if (ts.isJsxText(node) && node.text.trim()) copy.push(node.text.trim().replace(/\s+/g, " "));
    if (ts.isFunctionDeclaration(node) && node.body)
      preambles.push(
        node.body.statements
          .filter((statement) => !ts.isReturnStatement(statement))
          .map(print)
          .join("\n"),
      );
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { attributes, copy, preambles };
}

// Restore only the extracted gallery and its old selection state for the immutable
// business-baseline comparison. Real gallery callbacks/ratios/errors are tested separately.
function beforeNaturalSizing(text: string) {
  const prior = execFileSync(
    "git",
    ["show", "4ff56050aee9baf2579c19cde360b77d10b928bb:src/components/product-detail-content.tsx"],
    { encoding: "utf8" },
  );
  const priorFile = parse(prior);
  let priorGallery = "";
  let priorSelection = "";
  const findPrior = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.attributes.properties.some(
        (property) => property.getText(priorFile) === 'id="product-active-image"',
      )
    )
      priorGallery = node.parent.getText(priorFile);
    if (ts.isVariableStatement(node)) {
      const name = node.declarationList.declarations[0].name;
      if (ts.isArrayBindingPattern(name) && name.elements[0].getText(priorFile) === "activeImage")
        priorSelection = node.getText(priorFile);
    }
    ts.forEachChild(node, findPrior);
  };
  findPrior(priorFile);
  expect(priorGallery).toContain("Thumbnails");
  expect(priorSelection).toContain("setActiveImage");
  const file = parse(text);
  const edits: { start: number; end: number; replacement: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ProductGallery") {
      expect(node.getText(file)).toBe("<ProductGallery key={product.id} product={product} />");
      edits.push({ start: node.getStart(file), end: node.end, replacement: priorGallery });
    }
    // Normalize only the authorized capture-hook migration alongside the gallery extraction.
    if (ts.isVariableStatement(node) && node.getText(file) === "const posthog = useAnalytics();")
      edits.push({
        start: node.getStart(file),
        end: node.end,
        replacement: `const posthog = usePostHog();\n${priorSelection}`,
      });
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(edits).toHaveLength(2);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  return text;
}

// Normalize only the accepted detail's explicit accessibility/image presentation delta.
// Keep its original attribute order, business expressions, copy and function preambles protected.
function detailSignatures(text: string) {
  const original = signatures(beforeNaturalSizing(text));
  const attribute = (value: string) => signatures(`<div ${value} />`).attributes[0];
  const additions = new Set(
    [
      'aria-label="Ruta del producto"',
      'role="group"',
      'aria-label="Galería del producto"',
      'id="product-active-image"',
      'type="button"',
      "aria-label={`Ver vista ${i + 1} de ${product.title}`}",
      "aria-pressed={activeImage === url}",
      'aria-controls="product-active-image"',
    ].map(attribute),
  );
  const replacements = new Map(
    [
      ["preload", "priority"],
      ['sizes="(min-width: 1024px) 58.33vw, 100vw"', 'sizes="(max-width: 1024px) 100vw, 50vw"'],
      ['sizes="(min-width: 768px) 84px, 72px"', 'sizes="10vw"'],
    ].map(([accepted, previous]) => [attribute(accepted), attribute(previous)]),
  );
  return {
    ...original,
    attributes: original.attributes
      .filter((value) => !additions.has(value))
      .map((value) => replacements.get(value) ?? value),
  };
}

// Normalize the accepted responsive thumbnail and the authorized C1a focus-only delta.
// Assert each exact new AST shape before normalization; keep all prior business guards.
function cartSignatures(text: string) {
  const attribute = (value: string) => signatures(`<div ${value} />`).attributes[0];
  const file = parse(text);
  const edits: { start: number; end: number; replacement: string }[] = [];
  const deltas: string[] = [];
  const replace = (node: ts.Node, name: string, replacement = "", trailingComma = false) => {
    deltas.push(name);
    if (trailingComma) expect(text[node.end]).toBe(",");
    edits.push({ start: node.getStart(file), end: node.end + Number(trailingComma), replacement });
  };
  const visit = (node: ts.Node) => {
    if (ts.isBindingElement(node) && node.name.getText(file) === "restoreCartFocus") {
      expect(node.getText(file)).toBe("restoreCartFocus");
      expect(node.parent.parent.getText(file)).toContain("= useCart()");
      replace(node, "restoreCartFocus", "", true);
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(file) === "navigatingToCheckout",
      )
    ) {
      expect(semanticNode(node)).toEqual(
        semanticNode(parse("const navigatingToCheckout = useRef(false);").statements[0]),
      );
      replace(node, "navigationRef");
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(file);
      const owner = node.parent.parent;
      if (name === "inert" || name === "overlayClassName") {
        expect(ts.isJsxOpeningElement(owner) && owner.tagName.getText(file)).toBe("SheetContent");
        expect(JSON.stringify(semanticNode(node))).toBe(
          attribute(name === "inert" ? "inert={!isOpen}" : "overlayClassName={motion.cartOverlay}"),
        );
        replace(node, name);
      } else if (name === "onOpenAutoFocus" || name === "onCloseAutoFocus") {
        expect(ts.isJsxOpeningElement(owner) && owner.tagName.getText(file)).toBe("SheetContent");
        const expected =
          name === "onOpenAutoFocus"
            ? "onOpenAutoFocus={() => { navigatingToCheckout.current = false; }}"
            : "onCloseAutoFocus={(event) => { if (!navigatingToCheckout.current && restoreCartFocus?.()) event.preventDefault(); }}";
        expect(JSON.stringify(semanticNode(node))).toBe(attribute(expected));
        replace(node, name);
      } else if (
        name === "onClick" &&
        ts.isJsxOpeningElement(owner) &&
        owner.tagName.getText(file) === "Link"
      ) {
        expect(
          owner.attributes.properties.some(
            (property) => property.getText(file) === 'href="/checkout"',
          ),
        ).toBe(true);
        expect(JSON.stringify(semanticNode(node))).toBe(
          attribute("onClick={() => { navigatingToCheckout.current = true; setIsOpen(false); }}"),
        );
        replace(node, "checkout", "onClick={() => setIsOpen(false)}");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(deltas).toEqual([
    "restoreCartFocus",
    "navigationRef",
    "inert",
    "overlayClassName",
    "onOpenAutoFocus",
    "onCloseAutoFocus",
    "checkout",
  ]);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  const original = signatures(text);
  const acceptedSize = attribute('sizes="(min-width: 640px) 104px, 88px"');
  const previousSize = attribute('sizes="80px"');
  return {
    ...original,
    attributes: original.attributes.map((value) => (value === acceptedSize ? previousSize : value)),
  };
}

// Reverse only the authorized P2 hook import/call.
// The immutable accepted hash still protects every other byte of the header.
function beforeHeaderCartSplit(text: string) {
  for (const [accepted, previous] of [
    [
      'import { useCartHeader } from "@/contexts/cart-context";',
      'import { useCart } from "@/contexts/cart-context";',
    ],
    [
      "  const { totalItems, setIsOpen } = useCartHeader();",
      "  const { totalItems, setIsOpen } = useCart();",
    ],
  ]) {
    expect(text.split(accepted), "exactly one authorized header delta").toHaveLength(2);
    text = text.replace(accepted, previous);
  }
  return text;
}

describe("Source-preservation and actual in-memory Tailwind CSS", () => {
  it.each(paths)(
    "preserves %s against its accepted chrome/catalog/Card/detail/cart/admin identity or original nonpresentation baseline",
    (path) => {
      const baseline = execFileSync(
        "git",
        ["show", `${ORIGINAL_PRE_REDESIGN_COMMIT}:src/components/${path}`],
        {
          encoding: "utf8",
        },
      );
      if (path === "site-header.tsx" || path === "site-footer.tsx") {
        // Chrome deliberately replaces old markup and logic. Pin every accepted byte,
        // including all callbacks, literals and imports; do not discard AST nodes.
        const acceptedChrome = {
          // N3 replaces only scoped catalog/logo anchors and their notification owner.
          // Existing menu/cart/auth layout and callbacks remain pinned in full.
          "site-header.tsx": "e56eaff327dc2adffae8c460f983753382a3dbaf33652d0617133a61317d5c7f",
          "site-footer.tsx": "1e9a96519016d16e1c243e93281e9f3f464ab28336f8ac41990e4c510869f6bb",
        };
        const acceptedBytes =
          path === "site-header.tsx" ? beforeHeaderCartSplit(source(path)) : source(path);
        expect(createHash("sha256").update(acceptedBytes).digest("hex")).toBe(acceptedChrome[path]);
      } else if (path === "catalog-content.tsx" || path === "product-card.tsx") {
        // T4 authorizes editorial markup, not URL/filter/price logic. Compare the complete
        // non-return function bodies to the immutable accepted collection baseline instead
        // of hashing CSS bytes. Callback/history/stock contracts above protect the render path.
        const accepted = execFileSync(
          "git",
          ["show", `4ff56050aee9baf2579c19cde360b77d10b928bb:src/components/${path}`],
          { encoding: "utf8" },
        );
        expect(signatures(source(path)).preambles).toEqual(signatures(accepted).preambles);
        if (path === "product-card.tsx") {
          const previousPresentation = source(path)
            .replace("preload={priority}", "priority={priority}")
            .replace("(min-width: 1024px) 25vw, 50vw", "(min-width: 768px) 25vw, 50vw");
          expect(signatures(previousPresentation)).toEqual(signatures(accepted));
        } else {
          const callbacks = (text: string) => {
            const file = parse(text);
            const result: string[] = [];
            const visit = (node: ts.Node) => {
              if (
                ts.isJsxAttribute(node) &&
                ["onClick", "onChange", "onFiltersChange"].includes(node.name.getText(file))
              )
                result.push(JSON.stringify(semanticNode(node)));
              ts.forEachChild(node, visit);
            };
            visit(file);
            // Only redundant clear controls were removed; retain every distinct callback.
            return [...new Set(result)].sort();
          };
          const duplicateQueryClear = signatures(
            '<button onClick={() => navigateCatalogSearch("")} />',
          ).attributes[0];
          expect(callbacks(source(path))).toEqual(
            callbacks(accepted).filter((callback) => callback !== duplicateQueryClear),
          );
        }
      } else if (path === "product-detail-content.tsx") {
        // Motion T2 extracts the gallery. Normalize only that exact component call and
        // removed selection state, retaining the original business baseline elsewhere.
        // Image-sizing/gallery tests exercise the real extracted callbacks and ratios.
        expect(detailSignatures(source(path))).toEqual(signatures(baseline));
      } else if (path === "cart-drawer.tsx") {
        // Pin all accepted bytes alongside the original business/semantic baseline.
        // Authorized C1a autofocus/checkout handoff shapes are qualified above and in cart-shopping.
        // Mounted focus remains Playwright's responsibility, not these shallow callbacks.
        // Reverse only T3's exact opt-in motion additions; retain the prior full-byte pin.
        const beforeMotion = source(path)
          .replace('import motion from "./storefront-motion.module.css";\n', "")
          .replace("        inert={!isOpen}\n", "")
          .replace("        overlayClassName={motion.cartOverlay}\n", "")
          .replace("className={`${motion.cartPanel} ", 'className="')
          .replace(
            "[&>[data-slot=sheet-close]]:size-[44px]`}",
            '[&>[data-slot=sheet-close]]:size-[44px]"',
          );
        expect(createHash("sha256").update(beforeMotion).digest("hex")).toBe(
          "366549392ec3d1e022a70634f76a1d97a37d80d08b00fa9996afe7ae6017ad0a",
        );
        expect(cartSignatures(source(path))).toEqual(signatures(baseline));
      } else if (path === "admin/sidebar.tsx") {
        // Exact-root activity, accessible landmarks and mobile/return-store flows are accepted.
        // Pin every new byte while retaining the original desktop nonpresentation baseline.
        expect(createHash("sha256").update(source(path)).digest("hex")).toBe(
          "865be40066a33f976f25fa7fde9d9628b65958d0f0cd2919ae2d75abda5faa42",
        );
        // Reverse only the approved desktop brand substitution for the old semantic comparison.
        // The complete new source remains pinned above; mobile navigation is still covered in full.
        const previousBrand = source(path)
          .replace('          aria-label="clubvtg — Inicio"\n', "")
          .replace(
            '          <BrandMark alt="" className="w-[120px]" />',
            '<h1 className="font-sans text-[20px] leading-[1.3] font-normal">clubvtg <span className="ml-[6px] font-mono text-[13px] font-normal">Admin</span></h1>',
          )
          .replace(
            '\n        </Link>\n        <span className="font-mono text-[13px] font-normal">Admin</span>',
            "\n        </Link>",
          );
        expect(signatures(previousBrand, true)).toEqual(signatures(baseline));
      } else {
        expect(signatures(source(path))).toEqual(signatures(baseline));
      }
    },
  );

  it("compiles explicit dimensions, responsive fits, flat surfaces, regular type and focus", async () => {
    const candidates: string[] = [];
    for (const path of [...paths, "collection-editorial.tsx", "product-gallery.tsx"]) {
      const file = parse(source(path));
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateTail(node)
        )
          candidates.push(...node.text.split(/\s+/));
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    const classes = candidates.filter((value) => value && !value.includes(" "));
    // Clerk's pre-existing managed avatar dimensions are not app-owned styling.
    expect(classes.join(" ")).not.toMatch(
      /shadow|blur|animate-in|transition-|hover:scale|rounded-(?!none)|font-(bold|semibold|medium|light)|(?:bg|text)-(?:amber|green|red|blue)-/,
    );
    const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const themes = globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    const compiler = await compile(
      `${readFileSync(new URL("../../node_modules/tailwindcss/theme.css", import.meta.url), "utf8")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build(classes);
    // Extract one balanced utility block, retaining nested media/focus rules.
    const utility = (name: string): string => {
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
      const start = css.indexOf(selector);
      expect(start, name).toBeGreaterThanOrEqual(0);
      let depth = 0;
      for (let index = start + selector.length - 1; index < css.length; index++) {
        if (css[index] === "{") depth++;
        if (css[index] === "}" && --depth === 0) return css.slice(start, index + 1);
      }
      throw new Error(`Unbalanced CSS utility: ${name}`);
    };
    for (const [name, property, value] of [
      ["w-[240px]", "width", "240px"],
      ["min-h-[44px]", "min-height", "44px"],
      ["min-w-[44px]", "min-width", "44px"],
      ["w-[min(360px,100vw)]", "width", "min(360px, 100vw)"],
      ["sm:max-w-[360px]", "max-width", "360px"],
      ["md:hidden", "display", "none"],
      // Collection is now full-width with a compact select, not the old 250px sidebar.
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["gap-x-[10px]", "column-gap", "10px"],
      ["gap-y-[24px]", "row-gap", "24px"],
      // Accepted cart replaces fixed thumbnails and small removal targets with portrait rows.
      ["w-[88px]", "width", "88px"],
      ["sm:w-[104px]", "width", "104px"],
      ["aspect-4/5", "aspect-ratio", "4/5"],
      ["h-[36px]", "height", "36px"], // Retained header search field.
      ["[&::-webkit-search-cancel-button]:appearance-none", "appearance", "none"],
      ["h-[44px]", "height", "44px"],
      ["w-[44px]", "width", "44px"],
      ["h-[48px]", "height", "48px"],
      ["[&>[data-slot=sheet-close]]:size-[44px]", "width", "44px"],
      ["[&>[data-slot=sheet-close]]:size-[44px]", "height", "44px"],
      ["overscroll-contain", "overscroll-behavior", "contain"],
      ["gap-[0px]", "gap", "0px"],
      [
        "pb-[max(24px,env(safe-area-inset-bottom))]",
        "padding-bottom",
        "max(24px, env(safe-area-inset-bottom))",
      ],
      [
        "sm:pb-[max(30px,env(safe-area-inset-bottom))]",
        "padding-bottom",
        "max(30px, env(safe-area-inset-bottom))",
      ],
      ["min-h-[72px]", "min-height", "72px"],
      ["gap-[13px]", "gap", "13px"],
      ["gap-x-[0px]", "column-gap", "0px"],
      ["gap-y-[42px]", "row-gap", "42px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["py-[8px]", "padding-block", "8px"],
      ["p-[24px]", "padding", "24px"],
      ["scroll-mt-[156px]", "scroll-margin-top", "156px"],
      ["max-w-full", "max-width", "100%"],
      ["max-h-[60dvh]", "max-height", "60dvh"],
      ["sm:max-w-[560px]", "max-width", "560px"],
      ["w-full", "width", "100%"],
      ["min-h-0", "min-height", "calc(var(--spacing) * 0)"],
      ["overflow-y-auto", "overflow-y", "auto"],
      ["flex-wrap", "flex-wrap", "wrap"], // Compact controls wrap instead of scrolling old tabs.
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["font-sans", "font-family", "var(--font-familjen-grotesk)"],
      ["font-mono", "font-family", "var(--font-maison-neue-mono-local)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[16px]", "font-size", "16px"],
      ["text-[30px]", "font-size", "30px"],
      ["md:text-[15px]", "font-size", "15px"],
      ["md:w-[180px]", "width", "180px"],
      ["md:max-w-[420px]", "max-width", "420px"],
      ["md:flex", "display", "flex"],
      // Accepted detail uses a top-aligned 7:5 spread rather than the old equal columns.
      [
        "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
        "grid-template-columns",
        "minmax(0,7fr) minmax(0,5fr)",
      ],
      ["items-start", "align-items", "flex-start"],
      ["w-[72px]", "width", "72px"],
      ["md:w-[84px]", "width", "84px"],
      ["min-h-[48px]", "min-height", "48px"],
      ["md:grid-cols-4", "grid-template-columns", "repeat(4, minmax(0, 1fr))"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:-outline-offset-2", "outline-offset", "calc(2px * -1)"],
    ]) {
      expect(utility(name), `${name}: ${property}`).toContain(`${property}: ${value};`);
    }
    for (const [name, media] of [
      ["md:flex", "(width >= 48rem)"],
      ["md:hidden", "(width >= 48rem)"],
      ["sm:max-w-[360px]", "(width >= 40rem)"],
      ["lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]", "(width >= 64rem)"],
      ["md:w-[84px]", "(width >= 48rem)"],
      ["sm:max-w-[560px]", "(width >= 40rem)"],
      ["sm:w-[104px]", "(width >= 40rem)"],
      ["sm:pb-[max(30px,env(safe-area-inset-bottom))]", "(width >= 40rem)"],
    ]) {
      expect(utility(name)).toContain(`@media ${media}`);
    }
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    expect(utility("[&::-webkit-search-cancel-button]:appearance-none")).toContain(
      "&::-webkit-search-cancel-button",
    );
  });
});
