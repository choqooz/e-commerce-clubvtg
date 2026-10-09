import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { CATEGORIES, formatPrice } from "@/lib/config";
import { COLOR_MAP } from "@/lib/constants";

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
    if (!probe.catalogHooks)
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
vi.mock("@/contexts/cart-context", () => ({ useCart: () => probe.cart }));
vi.mock("@/lib/actions/credits", () => ({ getUserCredits: vi.fn() }));
vi.mock("posthog-js/react", () => ({ usePostHog: () => ({ capture: probe.capture }) }));
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
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { AdminSidebar } from "./admin/sidebar";
import { CatalogContent } from "./catalog-content";
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
      ? [child as Element, ...descendants((child as Element).props.children)]
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
  elements(tree, "button").find(
    (element) => html(element.props.children).replace(/<[^>]*>/g, "") === label,
  )!;
const chooseCollection = (tree: ReactNode, value: string) =>
  (elements(tree, "select")[0].props.onChange as (event: unknown) => void)({ target: { value } });

describe("Navigation contracts", () => {
  it("keeps announcement, wordmark, catalog, modal sign-in and zero-count cart", () => {
    const tree = SiteHeader();
    const markup = html(tree);
    for (const copy of ["clubvtg", "Catálogo", "Entrar", "Envío a todo el país · Correo Argentino"])
      expect(markup).toContain(copy);
    expect(markup).toContain('data-mode="modal"');
    expect(markup.match(/href="\/"/g)).toHaveLength(1);
    const home = elements(tree, "a").find((anchor) => anchor.props.href === "/")!;
    expect(home.props["aria-label"]).toBe("clubvtg — Inicio");
    // This shallow Sheet mock includes both desktop and unmounted mobile JSX.
    const catalogLinks = elements(tree, "a").filter((anchor) => anchor.props.href === "/#catalog");
    expect(catalogLinks).toHaveLength(2);
    expect(catalogLinks[1].props["aria-label"]).toBe("Catálogo");
    expect(catalogLinks[0].props.onClick).toBe(catalogLinks[1].props.onClick);
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

  it("keeps expandable autofocus field without inventing search handlers", () => {
    probe.states = [true];
    const tree = SiteHeader();
    const input = elements(tree, "input")[0];
    expect(input.props).toMatchObject({
      type: "text",
      placeholder: "Buscar prendas...",
      autoFocus: true,
    });
    expect(input.props.onChange).toBeUndefined();
    expect(input.props.onKeyDown).toBeUndefined();
    click(button(tree, "Buscar"));
    expect(probe.setState).toHaveBeenCalledWith(false);
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
    for (const [href, title] of [
      ["/admin", "Dashboard"],
      ["/admin/products", "Productos"],
      ["/admin/orders", "Órdenes"],
      ["/admin/coupons", "Cupones"],
    ]) {
      const anchor = descendants(tree).find((child) => child.props.href === href)!;
      expect(anchor.props.className!.includes("bg-warm-sand")).toBe(
        pathname === href || pathname.startsWith(`${href}/`),
      );
      expect(markup).toContain(title);
    }
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
    click(catalogButton(tree, "Limpiar filtros (1)"));
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
      expect(markup).toContain('sizes="(min-width: 768px) 25vw, 50vw"');
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
    const thumbnails = elements(tree, "button").filter(
      (element) => element.props.disabled === undefined,
    );
    expect(thumbnails).toHaveLength(2);
    click(thumbnails[1]);
    expect(probe.setState).toHaveBeenCalledWith("/shirt-back.jpg");
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
    expect(markup).toContain('sizes="80px"');
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
function signatures(text: string) {
  const file = parse(text);
  const attributes: string[] = [],
    copy: string[] = [],
    preambles: string[] = [];
  const print = (node: ts.Node) => JSON.stringify(semanticNode(node));
  const visit = (node: ts.Node) => {
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

describe("Source-preservation and actual in-memory Tailwind CSS", () => {
  it.each(paths)(
    "preserves %s against its accepted chrome/catalog/Card identity or original nonpresentation baseline",
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
          "site-header.tsx": "36d235d223105d5a36f2286c0ba35c07f008b256a2dbc810cc648a777bab7a2f",
          "site-footer.tsx": "e465e234f641f23ab346cf4e9a281c03b77f7dc580f10e3817fe0fc971b76575",
        };
        expect(createHash("sha256").update(source(path)).digest("hex")).toBe(acceptedChrome[path]);
      } else if (path === "catalog-content.tsx" || path === "product-card.tsx") {
        // Accepted collection gating/URL state and Card stock/sizes supersede the old premise.
        // Pin every byte, including all AST nodes; behavior contracts above qualify the change.
        const acceptedCatalog = {
          "catalog-content.tsx": "c1669224b4e6d8bbcfee0053d8f3c884b3ede34ab8cc684e3a091ef5442b3679",
          "product-card.tsx": "48ecbea82bd741f41f4d24529429bea80103a83afc9d6f6c10369325d79ce5a6",
        };
        expect(createHash("sha256").update(source(path)).digest("hex")).toBe(acceptedCatalog[path]);
      } else {
        expect(signatures(source(path))).toEqual(signatures(baseline));
      }
    },
  );

  it("compiles explicit dimensions, responsive fits, flat surfaces, regular type and focus", async () => {
    const candidates: string[] = [];
    for (const path of paths) {
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
      // Collection is now full-width with a compact select, not the old 250px sidebar.
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["gap-x-[10px]", "column-gap", "10px"],
      ["gap-y-[24px]", "row-gap", "24px"],
      ["w-[80px]", "width", "80px"],
      ["h-[96px]", "height", "96px"],
      ["h-[36px]", "height", "36px"],
      ["w-[28px]", "width", "28px"],
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
      ["sm:max-w-[448px]", "max-width", "448px"],
      ["w-full", "width", "100%"],
      ["min-h-0", "min-height", "calc(var(--spacing) * 0)"],
      ["overflow-y-auto", "overflow-y", "auto"],
      ["flex-wrap", "flex-wrap", "wrap"], // Compact controls wrap instead of scrolling old tabs.
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[16px]", "font-size", "16px"],
      ["md:text-[15px]", "font-size", "15px"],
      ["md:text-[111px]", "font-size", "111px"],
      ["md:flex", "display", "flex"],
      ["lg:grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))"],
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
      ["lg:grid-cols-2", "(width >= 64rem)"],
      ["sm:max-w-[448px]", "(width >= 40rem)"],
    ]) {
      expect(utility(name)).toContain(`@media ${media}`);
    }
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
  });
});
