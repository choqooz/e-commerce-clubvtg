import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every auth/action/database boundary is mocked before importing the async pages.
// These fixtures exercise server JSX, not Clerk internals or browser interactions.
const probe = vi.hoisted(() => ({
  currentUser: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  getAdminOrders: vi.fn(),
  getAdminCoupons: vi.fn(),
  productForm: vi.fn(),
  ordersTable: vi.fn(),
  couponLifecycle: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: probe.currentUser }));
vi.mock("next/navigation", () => ({ redirect: probe.redirect, notFound: probe.notFound }));
vi.mock("@/lib/config.server", () => ({ ADMIN_EMAIL: "admin@example.test" }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: probe.from } }));
vi.mock("@/lib/actions/orders", () => ({ getAdminOrders: probe.getAdminOrders }));
vi.mock("@/lib/actions/coupon-admin", () => ({ getAdminCoupons: probe.getAdminCoupons }));
vi.mock("@/components/admin/sidebar", () => ({
  AdminSidebar: () => <aside>Sidebar fixture</aside>,
}));
vi.mock("@/components/admin/product-form", () => ({ ProductForm: probe.productForm }));
vi.mock("@/components/admin/orders-table", () => ({ OrdersTable: probe.ordersTable }));
vi.mock("@/components/admin/coupon-lifecycle", () => ({ CouponLifecycle: probe.couponLifecycle }));
vi.mock("@clerk/nextjs", () => ({ SignIn: probe.signIn }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));
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
import AdminLayout from "@/app/admin/layout";
import AdminDashboard from "@/app/admin/page";
import AdminProductsPage from "@/app/admin/products/page";
import NewProductPage from "@/app/admin/products/new/page";
import EditProductPage from "@/app/admin/products/[slug]/edit/page";
import AdminOrdersPage from "@/app/admin/orders/page";
import AdminCouponsPage from "@/app/admin/coupons/page";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

const garment = {
  id: "fixture-product",
  slug: "camisa-vintage",
  title: "Camisa vintage",
  price: 12500,
  status: "available",
  category: "hombre",
  image_urls: ["/shirt.jpg"],
};
const admin = {
  primaryEmailAddressId: "primary",
  emailAddresses: [
    { id: "other", emailAddress: "other@example.test" },
    { id: "primary", emailAddress: "admin@example.test" },
  ],
};
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
beforeEach(() => {
  vi.resetAllMocks();
  probe.currentUser.mockResolvedValue(admin);
  probe.redirect.mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
  probe.notFound.mockImplementation(() => {
    throw new Error("notFound");
  });
  probe.from.mockReturnValue({ select: probe.select });
  probe.select.mockReturnValue({ order: probe.order, eq: probe.eq });
  probe.eq.mockReturnValue({ single: probe.single });
  probe.order.mockResolvedValue({ data: [garment], error: null });
  probe.single.mockResolvedValue({ data: garment, error: null });
  probe.getAdminOrders.mockResolvedValue([]);
  probe.getAdminCoupons.mockResolvedValue({ data: [] });
  probe.productForm.mockReturnValue(<div data-fixture="product-form" />);
  probe.ordersTable.mockReturnValue(<div data-fixture="orders-table" />);
  probe.couponLifecycle.mockReturnValue(<div data-fixture="coupon-lifecycle" />);
  probe.signIn.mockReturnValue(<div data-fixture="clerk-sign-in" />);
});

// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "src/app/admin/layout.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/products/page.tsx",
  "src/app/admin/products/new/page.tsx",
  "src/app/admin/products/[slug]/edit/page.tsx",
  "src/app/admin/orders/page.tsx",
  "src/app/admin/coupons/page.tsx",
  "src/app/sign-in/[[...sign-in]]/page.tsx",
];
const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const appearanceKeys = [
  "rootBox",
  "card",
  "headerTitle",
  "headerSubtitle",
  "formButtonPrimary",
  "formFieldInput",
  "footerActionLink",
];
function isAppearanceClass(node: ts.Node): boolean {
  if (
    !ts.isStringLiteral(node) ||
    !ts.isPropertyAssignment(node.parent) ||
    !appearanceKeys.includes(node.parent.name.getText())
  )
    return false;
  const elements = node.parent.parent.parent;
  if (!ts.isPropertyAssignment(elements) || elements.name.getText() !== "elements") return false;
  const expression = elements.parent.parent;
  return (
    ts.isJsxExpression(expression) &&
    ts.isJsxAttribute(expression.parent) &&
    expression.parent.name.getText() === "appearance" &&
    expression.parent.parent.parent.getText().startsWith("<SignIn")
  );
}
// Only className/EXISTING Clerk element class strings and formatting are normalized.
// Keep appearance keys, all other props, imports, guards, queries and JSX structure.
function behavior(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression);
  if (ts.isJsxAttribute(node) && node.name.getText() === "className") return undefined;
  if (isAppearanceClass(node)) return [node.kind, "<element-class>"];
  if (ts.isJsxText(node)) {
    const lines = node.text.split(/\r\n|\n|\r/);
    const last = Math.max(
      0,
      lines.findLastIndex((line) => /[^ \t]/.test(line)),
    );
    const text = lines
      .map((line, index) => {
        let content = line.replace(/\t/g, " ");
        if (index !== 0) content = content.replace(/^ +/, "");
        if (index !== lines.length - 1) content = content.replace(/ +$/, "");
        return content && index !== last ? `${content} ` : content;
      })
      .join("");
    return text ? [node.kind, text] : undefined;
  }
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    const value = behavior(child);
    if (value !== undefined) children.push(value);
  });
  return [
    node.kind,
    ts.isIdentifier(node) ||
    ts.isLiteralExpression(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
      ? node.text
      : null,
    children,
  ];
}
describe("G56C2 eight-route AST preservation", () => {
  it.each(paths)(
    "preserves nonpresentation syntax in %s relative to the original pre-redesign baseline",
    (path) => {
      expect(behavior(parse(source(path)))).toEqual(
        behavior(
          parse(
            execFileSync("git", ["show", `${ORIGINAL_PRE_REDESIGN_COMMIT}:${path}`], {
              encoding: "utf8",
            }),
          ),
        ),
      );
    },
  );
  it("keeps guards, params, queries, copy, links and Clerk configuration outside existing element classes", () => {
    const original =
      'const view = <SignIn appearance={{ elements: { rootBox: "old" }, layout: { logoPlacement: "inside" } }} />; const page = <a className="old" href="/admin">Productos</a>; const query = db.order("created_at", {ascending: false}); const slug = await params;';
    expect(behavior(parse(original.replaceAll('"old"', '"new"')))).toEqual(
      behavior(parse(original)),
    );
    for (const [before, after] of [
      ["rootBox", "card"],
      ["inside", "outside"],
      ["Productos", "Prendas"],
      ["/admin", "/orders"],
      ["false", "true"],
      ["created_at", "price"],
      ["await params", "params"],
    ])
      expect(behavior(parse(original.replace(before, after)))).not.toEqual(
        behavior(parse(original)),
      );
  });
});

describe("Async route fixture contracts (no real auth, network or database)", () => {
  it("uses the designated primary email and keeps sidebar/children", async () => {
    const markup = html(await AdminLayout({ children: <p>Contenido</p> }));
    expect(markup).toContain("Sidebar fixture");
    expect(markup).toContain("Contenido");
    expect(probe.currentUser).toHaveBeenCalledOnce();
    expect(probe.redirect).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...admin, primaryEmailAddressId: "missing" },
    { ...admin, primaryEmailAddressId: "other" },
  ])("redirects unauthorized primary email before rendering: %j", async (user) => {
    probe.currentUser.mockResolvedValue(user);
    await expect(AdminLayout({ children: "private" })).rejects.toThrow("redirect:/");
    expect(probe.redirect).toHaveBeenCalledWith("/");
    expect(probe.from).not.toHaveBeenCalled();
  });
  it("keeps the redirect-only dashboard unchanged", () => {
    expect(() => AdminDashboard()).toThrow("redirect:/admin/products");
    expect(probe.redirect).toHaveBeenCalledWith("/admin/products");
  });
  it("keeps product query ordering, price, status, images and create/edit links", async () => {
    probe.order.mockResolvedValue({
      data: [
        garment,
        { ...garment, id: "sold", slug: "sold", status: "sold", image_urls: [] },
        { ...garment, id: "reserved", slug: "reserved", status: "reserved", image_urls: null },
      ],
      error: null,
    });
    const markup = html(await AdminProductsPage());
    expect(probe.from).toHaveBeenCalledWith("products");
    expect(probe.select).toHaveBeenCalledWith("*");
    expect(probe.order).toHaveBeenCalledWith("created_at", { ascending: false });
    for (const text of [
      "Productos",
      "(3 en total)",
      "available",
      "sold",
      "reserved",
      "hombre",
      (12500).toLocaleString("es-AR"),
    ])
      expect(markup).toContain(text);
    expect(markup).toContain('href="/admin/products/new"');
    expect(markup).toContain('href="/admin/products/camisa-vintage/edit"');
    expect(markup).toContain('src="/shirt.jpg"');
    expect(markup).toContain('sizes="40px"');
    expect((markup.match(/<img /g) ?? []).length).toBe(1);
  });
  it("keeps zero-product empty state and the existing null/error distinction", async () => {
    probe.order.mockResolvedValue({ data: [], error: null });
    expect(html(await AdminProductsPage())).toContain("No hay productos cargados todavía.");
    const error = { message: "fixture query error" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      probe.order.mockResolvedValue({ data: null, error });
      const markup = html(await AdminProductsPage());
      expect(markup).toContain("(0 en total)");
      expect(markup).not.toContain("No hay productos cargados todavía.");
      expect(log).toHaveBeenCalledWith("Error fetching products:", error);
    } finally {
      log.mockRestore();
    }
  });
  it("keeps the new product form without edit props", () => {
    expect(html(<NewProductPage />)).toContain("Completá los detalles de la prenda");
    expect(probe.productForm.mock.calls[0][0]).toEqual({});
    expect(probe.from).not.toHaveBeenCalled();
  });
  it("awaits promised slug before querying and passes the same product/editSlug", async () => {
    let resolve!: (value: { slug: string }) => void;
    const params = new Promise<{ slug: string }>((done) => {
      resolve = done;
    });
    const pending = EditProductPage({ params });
    expect(probe.from).not.toHaveBeenCalled();
    resolve({ slug: garment.slug });
    expect(html(await pending)).toContain(`Actualizá los detalles de ${garment.title}.`);
    expect(probe.from).toHaveBeenCalledWith("products");
    expect(probe.select).toHaveBeenCalledWith("*");
    expect(probe.eq).toHaveBeenCalledWith("slug", garment.slug);
    expect(probe.single).toHaveBeenCalledOnce();
    expect(probe.productForm.mock.calls[0][0]).toEqual({
      initialData: garment,
      editSlug: garment.slug,
    });
  });
  it.each([
    { data: null, error: null },
    { data: garment, error: { message: "fixture" } },
  ])("keeps notFound for a missing/error product: %j", async (result) => {
    probe.single.mockResolvedValue(result);
    await expect(EditProductPage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow(
      "notFound",
    );
    expect(probe.productForm).not.toHaveBeenCalled();
  });
  it.each([null, []])("keeps orders empty/null fallback: %j", async (orders) => {
    probe.getAdminOrders.mockResolvedValue(orders);
    expect(html(await AdminOrdersPage())).toContain("No hay órdenes aún");
    expect(probe.getAdminOrders).toHaveBeenCalledOnce();
    expect(probe.ordersTable).not.toHaveBeenCalled();
  });
  it("passes the exact populated orders without filtering or changing stats", async () => {
    const orders = [
      { id: "fixture-order", total_amount: 12000, created_at: "2026-01-01T12:00:00Z" },
    ];
    probe.getAdminOrders.mockResolvedValue(orders);
    expect(html(await AdminOrdersPage())).toContain("Gestión de pedidos (1 en total).");
    expect(probe.ordersTable.mock.calls[0][0].orders).toBe(orders);
  });
  it("passes coupons unchanged and keeps the action error state", async () => {
    const coupons = [{ id: "fixture-coupon", code: "AHORRO", state: "active" }];
    probe.getAdminCoupons.mockResolvedValue({ data: coupons });
    expect(html(await AdminCouponsPage())).toContain(
      "Creá, desactivá y reemplazá códigos de uso limitado.",
    );
    expect(probe.couponLifecycle.mock.calls[0][0].coupons).toBe(coupons);
    probe.couponLifecycle.mockClear();
    probe.getAdminCoupons.mockResolvedValue({ error: "No se pudieron cargar los cupones." });
    expect(html(await AdminCouponsPage())).toContain("No se pudieron cargar los cupones.");
    expect(probe.couponLifecycle).not.toHaveBeenCalled();
  });
  it("keeps Clerk-managed SignIn with only the pre-existing appearance element keys", () => {
    expect(html(<SignInPage />)).toContain('data-fixture="clerk-sign-in"');
    const props = probe.signIn.mock.calls[0][0];
    expect(Object.keys(props)).toEqual(["appearance"]);
    expect(Object.keys(props.appearance)).toEqual(["elements"]);
    expect(Object.keys(props.appearance.elements)).toEqual(appearanceKeys);
  });
});

function classCandidates(text: string): string[] {
  const candidates: string[] = [];
  const collect = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      candidates.push(...node.text.split(/\s+/).filter(Boolean));
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isJsxAttribute(node) && node.name.getText() === "className") || isAppearanceClass(node))
      collect(node);
    else ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return candidates;
}
describe("Actual wrapper and existing Clerk class CSS compiled in memory", () => {
  it("keeps neutral square hairlines, bounded responsive layouts, explicit spacing and focus", async () => {
    const classes = new Set(paths.flatMap((path) => classCandidates(source(path))));
    expect([...classes].join(" ")).not.toMatch(
      /shadow-(?!none)|blur|scale|rounded-(?!none)|font-(bold|semibold|medium|light)|(?:bg|text|border)-(?:amber|green|red|blue|gray)-/,
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    const utility = (name: string) => {
      expect(classes.has(name), name).toBe(true);
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
      const start = css.indexOf(selector);
      expect(start, name).toBeGreaterThanOrEqual(0);
      let depth = 0;
      for (let index = start + selector.length - 1; index < css.length; index++) {
        if (css[index] === "{") depth++;
        if (css[index] === "}" && --depth === 0) return css.slice(start, index + 1);
      }
      throw new Error(`Unbalanced utility: ${name}`);
    };
    const checks = [
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["w-full", "width", "100%"],
      ["max-w-[1440px]", "max-width", "1440px"],
      ["max-w-[896px]", "max-width", "896px"],
      ["max-w-[400px]", "max-width", "400px"],
      ["min-w-[720px]", "min-width", "720px"],
      ["overflow-x-auto", "overflow-x", "auto"],
      ["overflow-y-auto", "overflow-y", "auto"],
      ["p-[18px]", "padding", "18px"],
      ["md:p-[30px]", "padding", "30px"],
      ["p-[13px]", "padding", "13px"],
      ["md:p-[24px]", "padding", "24px"],
      ["px-[13px]", "padding-inline", "13px"],
      ["py-[13px]", "padding-block", "13px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[2px]", "padding-block", "2px"],
      ["py-[42px]", "padding-block", "42px"],
      ["gap-[6px]", "gap", "6px"],
      ["gap-[18px]", "gap", "18px"],
      ["gap-[24px]", "gap", "24px"],
      ["h-[16px]", "height", "16px"],
      ["w-[16px]", "width", "16px"],
      ["h-[40px]", "height", "40px"],
      ["w-[40px]", "width", "40px"],
      ["min-h-[36px]", "min-height", "36px"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["border-dotted", "border-style", "dotted"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["bg-midnight-ink", "background-color", "var(--color-midnight-ink)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[30px]", "font-size", "30px"],
      ["md:text-[15px]", "font-size", "15px"],
      ["sm:flex-row", "flex-direction", "row"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
      ["shadow-none", "--tw-shadow", "0 0 #0000"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), name).toContain(`${property}: ${value};`);
    for (const [name, width] of [
      ["sm:flex-row", "40rem"],
      ["sm:items-center", "40rem"],
      ["md:p-[30px]", "48rem"],
      ["md:p-[24px]", "48rem"],
      ["md:px-[30px]", "48rem"],
      ["md:text-[15px]", "48rem"],
    ])
      expect(utility(name)).toContain(`@media (width >= ${width})`);
    expect(utility("min-h-[calc(100dvh-64px)]")).toContain("min-height: calc(100dvh - 64px);");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    for (const [token, value] of [
      ["midnight-ink", "#000000"],
      ["bone-white", "#ffffff"],
      ["warm-sand", "#ebe6dc"],
    ])
      expect(css).toContain(`--color-${token}: ${value};`);
    console.info(
      `G56C2 CSS: ${classes.size} candidates; ${checks.length} declarations, 6 breakpoints, viewport bound, focus and 3 neutral tokens verified in memory.`,
    );
  });
});
