import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { CATEGORIES, formatPrice } from "@/lib/config";
import { COLOR_MAP } from "@/lib/constants";

// Shallow hooks/SSR only. Effects and callbacks run explicitly against mocks, never live services.
const probe = vi.hoisted(() => ({
  signedIn: false,
  pathname: "/admin",
  states: [] as unknown[],
  stateIndex: 0,
  setState: vi.fn(),
  effects: [] as (() => void)[],
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
    return [index < probe.states.length ? probe.states[index] : initial, probe.setState];
  },
  useEffect: (effect: () => void) => {
    probe.effects.push(effect);
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: probe.signedIn }),
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
  elements(tree, "button").find(
    (child) =>
      child.props["aria-label"] === label ||
      renderToStaticMarkup(<>{child.props.children}</>) === label,
  )!;
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
    pathname: "/admin",
    states: [],
    stateIndex: 0,
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

describe("Navigation contracts", () => {
  it("keeps announcement, wordmark, catalog, modal sign-in and zero-count cart", () => {
    const tree = SiteHeader();
    const markup = html(tree);
    for (const copy of ["clubvtg", "Catálogo", "Entrar", "Envío a todo el país · Correo Argentino"])
      expect(markup).toContain(copy);
    expect(markup).toContain('data-mode="modal"');
    expect(markup.match(/href="\/"/g)).toHaveLength(2);
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
    probe.states = [false, 7];
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
    expect(probe.setState).toHaveBeenCalledWith(7);
  });

  it("retains footer destinations, shipping copy, brand text and current year", () => {
    const markup = html(SiteFooter());
    for (const path of ["/", "/credits", "mailto:choqooz@gmail.com"])
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
  it("composes accepted banner, filters, cards and shared chrome without changing initial data", () => {
    const tree = CatalogContent({ initialProducts: [garment, second] });
    expect(elements(tree, SiteHeader)).toHaveLength(1);
    expect(elements(tree, SiteFooter)).toHaveLength(1);
    expect(elements(tree, CartDrawer)).toHaveLength(1);
    expect(elements(tree, CategoryBanner)).toHaveLength(1);
    expect(
      elements(tree, ProductCard).map((card) => [card.props.product, card.props.priority]),
    ).toEqual([
      [garment, true],
      [second, false],
    ]);
    for (const filter of elements(tree, CatalogFilters))
      expect(filter.props).toMatchObject({
        filters: EMPTY_FILTERS,
        categoryProducts: [garment, second],
        onFiltersChange: probe.setState,
      });
    const tabs = elements(tree, "button");
    expect(tabs.map((tab) => Children.toArray(tab.props.children)[0])).toEqual(
      CATEGORIES.map((category) => category.label),
    );
    click(tabs[1]);
    expect(probe.setState).toHaveBeenCalledWith(CATEGORIES[1].id);
    expect(html(tree)).toContain("2 prendas encontradas");
  });

  it("retains category narrowing, subcategory-only reset, active count, clear and empty state", () => {
    const filters = { ...EMPTY_FILTERS, subcategory: "camisas", sizes: ["M"] };
    probe.states = ["hombre", filters];
    const tree = CatalogContent({ initialProducts: [garment, second] });
    expect(elements(tree, ProductCard).map((card) => card.props.product)).toEqual([garment]);
    expect(elements(tree, CatalogFilters)[0].props.categoryProducts).toEqual([garment]);
    expect(html(tree)).toContain("1 prenda encontrada");
    click(elements(tree, "button")[0]);
    const updater = probe.setState.mock.calls.find(([value]) => typeof value === "function")![0];
    expect(updater(filters)).toEqual({ ...filters, subcategory: null });
    click(
      elements(tree, "button").find(
        (element) => element.props.onClick && element.props.className?.includes("lg:flex"),
      )!,
    );
    expect(probe.setState).toHaveBeenCalledWith(EMPTY_FILTERS);
    probe.stateIndex = 0;
    probe.states = ["hombre", { ...EMPTY_FILTERS, sizes: ["XXL"] }];
    const empty = CatalogContent({ initialProducts: [garment] });
    expect(elements(empty, ProductCard)).toHaveLength(0);
    expect(html(empty)).toContain("No encontramos prendas con estos filtros.");
    expect(html(empty)).toContain("Limpiar filtros");
  });

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
    "preserves %s nonpresentation JSX attributes, copy and function logic relative to the original pre-redesign baseline",
    (path) => {
      const baseline = execFileSync(
        "git",
        ["show", `${ORIGINAL_PRE_REDESIGN_COMMIT}:src/components/${path}`],
        {
          encoding: "utf8",
        },
      );
      expect(signatures(source(path))).toEqual(signatures(baseline));
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
      ["w-[250px]", "width", "250px"],
      ["w-[80px]", "width", "80px"],
      ["h-[96px]", "height", "96px"],
      ["h-[36px]", "height", "36px"],
      ["w-[28px]", "width", "28px"],
      ["min-h-[72px]", "min-height", "72px"],
      ["gap-[13px]", "gap", "13px"],
      ["gap-x-[0px]", "column-gap", "0px"],
      ["gap-y-[42px]", "row-gap", "42px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["py-[11px]", "padding-block", "11px"],
      ["p-[24px]", "padding", "24px"],
      ["top-[156px]", "top", "156px"],
      ["max-h-[calc(100dvh-180px)]", "max-height", "calc(100dvh - 180px)"],
      ["max-h-[60dvh]", "max-height", "60dvh"],
      ["sm:max-w-[448px]", "max-width", "448px"],
      ["w-full", "width", "100%"],
      ["min-h-0", "min-height", "calc(var(--spacing) * 0)"],
      ["overflow-y-auto", "overflow-y", "auto"],
      ["overflow-x-auto", "overflow-x", "auto"],
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
      ["md:grid-cols-3", "grid-template-columns", "repeat(3, minmax(0, 1fr))"],
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
