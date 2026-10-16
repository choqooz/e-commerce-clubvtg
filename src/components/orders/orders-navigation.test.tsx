import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrdersLayout from "@/app/orders/layout";
import Loading from "@/app/orders/loading";
import OrdersPage from "@/app/orders/page";
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import { OrdersPageContent } from "./orders-page-content";

// Actual route/content and links render; only auth/data/chrome are isolated.
// No mounted effects, Clerk session, database or network requests are exercised.
const probe = vi.hoisted(() => ({
  auth: vi.fn(),
  orders: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  fetch: vi.fn(() => {
    throw new Error("Unexpected network request");
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: probe.auth }));
vi.mock("@/lib/actions/orders", () => ({ getUserOrders: probe.orders }));
vi.mock("next/navigation", () => ({ redirect: probe.redirect }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header data-chrome="header" /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => <aside data-chrome="cart" /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer data-chrome="footer" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  probe.auth.mockReset().mockResolvedValue({ userId: "fixture-user" });
  probe.orders.mockReset().mockResolvedValue([]);
  vi.stubGlobal("fetch", probe.fetch);
});
afterEach(() => {
  try {
    expect(probe.fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const layoutSource = () => source("src/app/orders/layout.tsx");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
// Parent pretask bytes, not HEAD. Normalize only each exact authorized root class.
const paddingBaselines = [
  {
    path: "src/app/orders/page.tsx",
    // OrdersPage / empty-state if / return / root div / className.
    classPath: [8, 4, 3, 1, 0, 0, 0, 0, 1, 0],
    before:
      "w-full bg-bone-white px-[18px] py-[42px] text-center font-sans font-normal text-[15px] leading-[1.3] text-midnight-ink",
    after:
      "w-full bg-bone-white px-[18px] pt-0 pb-[42px] text-center font-sans font-normal text-[15px] leading-[1.3] text-midnight-ink",
    sourceDigest: "3b06a19556afe6d982f3e1db300b729c24efcdb16458eb0c9edf610d3dd4f325",
    nonclassDigest: "a4cccf330711632c6cf7211834379a8bb08141cdff38d454a1a15640061d562f",
  },
  {
    path: "src/app/orders/loading.tsx",
    // Loading / return / outer div / content div / className.
    classPath: [0, 3, 0, 0, 0, 2, 0, 1, 0],
    before: "container mx-auto px-4 py-10",
    after: "container mx-auto px-4 pt-0 pb-10",
    sourceDigest: "0fced0f6c063a703525e851d85ce5a5c9652e703065c47a19d30c86037b6d964",
    nonclassDigest: "e00de9cbed059cab9f8c93968339422691c6d9192c425d9f9bf6fcd00dbce59e",
  },
  {
    path: "src/components/orders/orders-page-content.tsx",
    // OrdersPageContent / return / root div / className.
    classPath: [11, 3, 0, 0, 0, 0, 1, 0],
    before:
      "w-full bg-bone-white px-[18px] py-[42px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink md:px-[30px]",
    after:
      "w-full bg-bone-white px-[18px] pt-0 pb-[42px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink md:px-[30px]",
    sourceDigest: "250285950034e80aad50205d4d1eb1b16293c9ef50e1e03b9581443aad4efabe",
    nonclassDigest: "b6316b9c5514d1ac2af887f8967cccad89942229ed540505db4bef6ac26931d5",
  },
  {
    path: "src/app/orders/layout.tsx",
    // OrdersLayout / return / shell div / main / breadcrumb wrapper / className.
    classPath: [5, 4, 0, 0, 0, 6, 2, 0, 1, 0],
    before: "w-full px-[18px] py-[18px] md:px-[30px]",
    after: "w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]",
    // Derived from the original pre-S1 parent's actual layout, not current or HEAD.
    sourceDigest: "a29bd446e98dfc58a202556ddc777030698e7ffe77ed6ed219a793d38bdd1f6a",
    nonclassDigest: "846ded51652d19213d904f76ef5e23fbc8c11f7e22412ec9c3007c649ba9ca19",
  },
];
function normalizePadding(text: string, baseline: (typeof paddingBaselines)[number]) {
  const file = ts.createSourceFile(
    "surface.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const at = (position: number[]) => {
    let target: ts.Node | undefined = file;
    for (const index of position) {
      const children: ts.Node[] = [];
      if (target)
        ts.forEachChild(target, (child) => {
          children.push(child);
        });
      target = children[index];
    }
    return target;
  };
  const target = at(baseline.classPath);
  const matches: ts.JsxAttribute[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "className" &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      [baseline.before, baseline.after].includes(node.initializer.text)
    )
      matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Invalid position/count is left unnormalized, so the exact byte guard fails.
  if (
    matches.length !== 1 ||
    matches[0] !== target ||
    !target ||
    !ts.isJsxAttribute(target) ||
    !target.initializer ||
    !ts.isStringLiteral(target.initializer)
  )
    return text;
  const edits = [
    {
      start: target.initializer.getStart(file),
      end: target.initializer.getEnd(),
      before: baseline.before,
    },
  ];
  if (baseline.path === "src/app/orders/layout.tsx") {
    // T3 adds alignment only at this exact breadcrumb nav attribute. Preserve
    // the original S1 hash and all four padding guards, not a new accepted hash.
    const before =
      "flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono";
    const after = `${before} md:mx-auto md:max-w-[1200px]`;
    const nav = at([5, 4, 0, 0, 0, 6, 2, 2, 0, 1, 1]);
    const alignmentMatches: ts.JsxAttribute[] = [];
    const find = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(file) === "className" &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        [before, after].includes(node.initializer.text)
      )
        alignmentMatches.push(node);
      ts.forEachChild(node, find);
    };
    find(file);
    if (
      alignmentMatches.length !== 1 ||
      alignmentMatches[0] !== nav ||
      !nav ||
      !ts.isJsxAttribute(nav) ||
      !nav.initializer ||
      !ts.isStringLiteral(nav.initializer)
    )
      return text;
    edits.push({ start: nav.initializer.getStart(file), end: nav.initializer.getEnd(), before });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + `"${edit.before}"` + text.slice(edit.end);
  return text;
}
function nonclassBytes(text: string) {
  const file = ts.createSourceFile(
    "surface.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const ranges: [number, number][] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
      node.name.getText(file) === "className" &&
      node.initializer
    )
      ranges.push([node.initializer.getStart(file), node.initializer.getEnd()]);
    else ts.forEachChild(node, visit);
  };
  visit(file);
  for (const [start, end] of ranges.reverse())
    text = `${text.slice(0, start)}"<class>"${text.slice(end)}`;
  return text;
}
type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const html = (children: ReactNode) => renderToStaticMarkup(<OrdersLayout>{children}</OrdersLayout>);
const order: OrderHistoryOrder = {
  clerk_anonymized_at: null,
  coupon_definitions: null,
  created_at: "2026-08-30T12:00:00Z",
  customer_email: "buyer@example.test",
  customer_name: "Buyer",
  id: "order-12345678",
  merchandise_discount_cents: null,
  merchandise_final_cents: null,
  merchandise_original_cents: null,
  mp_payment_id: null,
  mp_preference_id: null,
  order_items: [],
  payment_amount_cents: null,
  pricing_source: null,
  product_payment_reversal_evidence: [],
  promotion_ids: [],
  shipping_cents: null,
  shipping_fee: 0,
  shipping_info: null,
  shipped_at: null,
  status: "shipped",
  total_amount: 8500,
  total_cents: null,
  tracking_number: "TRACK-FIXTURE",
  updated_at: "2026-08-30T12:00:00Z",
  user_id: "fixture-user",
};

function expectSingleShell(markup: string) {
  for (const chrome of ["header", "cart", "footer"])
    expect(markup.match(new RegExp(`data-chrome="${chrome}"`, "g"))).toHaveLength(1);
  expect(markup.match(/<main\b/g)).toHaveLength(1);
  expect(markup.match(/aria-label="Navegación de pedidos"/g)).toHaveLength(1);
  const nav = markup.match(
    /<nav[^>]*aria-label="Navegación de pedidos"[^>]*>([\s\S]*?)<\/nav>/,
  )![1];
  expect(nav).toMatch(/href="\/profile"[^>]*>Mi Cuenta<\/a>/);
  expect(nav).toContain('<span aria-hidden="true">→</span>');
  expect(nav).toContain('<span aria-current="page">Mis pedidos</span>');
  expect(nav.match(/<a\b/g)).toHaveLength(1);
  expect(nav.replace(/<[^>]*>/g, "")).toBe("Mi Cuenta→Mis pedidos");
  expect(markup).not.toContain("Volver al perfil");
  expect(nav).not.toContain("Catálogo");
  expect(markup).not.toContain('href="/#catalog"');
  expect(markup).not.toMatch(/<main\b[^>]*>[\s\S]*<main\b/);
  expect(markup.indexOf('data-chrome="header"')).toBeLessThan(markup.indexOf("<main"));
  expect(markup.indexOf("</main>")).toBeLessThan(markup.indexOf('data-chrome="footer"'));
}

describe("R1 shared compact orders breadcrumb (isolated SSR)", () => {
  it.each([null, []])(
    "wraps the actual empty/null page without duplicate chrome: %j",
    async (orders) => {
      probe.orders.mockResolvedValue(orders);
      const markup = html(await OrdersPage());
      expectSingleShell(markup);
      expect(markup).toContain("No tenés pedidos aún");
      expect(markup).toContain(
        "Cuando hagas tu primera compra, vas a poder ver el estado de tus pedidos acá.",
      );
      expect(markup).toMatch(/href="\/"[^>]*>Explorar catálogo<\/a>/);
      expect(probe.auth).toHaveBeenCalledExactlyOnceWith();
      expect(probe.orders).toHaveBeenCalledExactlyOnceWith();
    },
  );
  it("wraps actual populated content while preserving order props and tracking", async () => {
    const orders = [order];
    probe.orders.mockResolvedValue(orders);
    const page = await OrdersPage();
    expect(page.props.orders).toBe(orders);
    const markup = html(page);
    expectSingleShell(markup);
    expect(markup).toContain("Mis Pedidos");
    expect(markup).toContain("#order-12");
    expect(markup).toContain("Enviado");
    expect(markup).toContain(
      `href="https://www.correoargentino.com.ar/formularios/e-comercio?id=${order.tracking_number}"`,
    );
    expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
    expect(probe.auth).toHaveBeenCalledExactlyOnceWith();
    expect(probe.orders).toHaveBeenCalledExactlyOnceWith();
  });
  it("wraps existing loading under the same shell without auth or data calls", () => {
    const markup = html(<Loading />);
    expectSingleShell(markup);
    expect(markup).toContain("animate-pulse");
    expect(markup).not.toContain("No tenés pedidos aún");
    expect(probe.auth).not.toHaveBeenCalled();
    expect(probe.orders).not.toHaveBeenCalled();
  });
  it("keeps the unauthenticated redirect before the orders query", async () => {
    probe.auth.mockResolvedValue({ userId: null });
    await expect(OrdersPage()).rejects.toThrow("redirect:/sign-in?redirect_url=/orders");
    expect(probe.redirect).toHaveBeenCalledExactlyOnceWith("/sign-in?redirect_url=/orders");
    expect(probe.orders).not.toHaveBeenCalled();
  });
  it("places one native-focusable account link and noninteractive current crumb before unchanged children", () => {
    const child = <section data-fixture="content" />;
    const nodes = descendants(OrdersLayout({ children: child }));
    const main = nodes.find((node) => node.type === "main")!;
    expect((main.props.children as ReactNode[]).at(-1)).toBe(child);
    const nav = nodes.find((node) => node.type === "nav")!;
    const links = descendants(nav).filter((node) => typeof node.props.href === "string");
    expect(links.map((link) => [link.props.href, link.props.children])).toEqual([
      ["/profile", "Mi Cuenta"],
    ]);
    const current = descendants(nav).find((node) => node.props["aria-current"] === "page")!;
    expect(current.type).toBe("span");
    expect(current.props.children).toBe("Mis pedidos");
    expect(current.props.href).toBeUndefined();
    expect(current.props.tabIndex).toBeUndefined();
    for (const link of links) {
      expect(link.props.tabIndex).toBeUndefined();
      expect(link.props.onClick).toBeUndefined();
      expect(link.props.className).toContain("min-h-[48px]");
      expect(link.props.className).toContain("focus-visible:outline-2");
    }
  });
  it("retains profile-aligned top/inline geometry and touch row with only smaller bottom padding", () => {
    const nodes = descendants(OrdersLayout({ children: <section /> }));
    const nav = nodes.find((node) => node.type === "nav")!;
    const wrapper = nodes.find(
      (node) =>
        node.type === "div" &&
        isValidElement(node.props.children) &&
        node.props.children.type === "nav",
    )!;
    const profile = source("src/components/profile/profile-page-content.tsx");
    const profileWrapper = profile.match(/<div className="([^"]*)">\s*<nav className="([^"]*)">/)!;
    expect(profileWrapper).not.toBeNull();
    expect(wrapper.props.className).toBe(profileWrapper[1]);
    expect(wrapper.props.className).toBe(
      "w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]",
    );
    expect(nav.props.className).toBe(profileWrapper[2]);
    expect(nav.props.className).toContain("flex-wrap");
    expect(nav.props.className).toContain("gap-[6px]");
    for (const node of [nav, ...descendants(nav)])
      expect(node.props.className ?? "").not.toMatch(
        /border|flex-col|sm:flex-row|pb-\[|py-\[12px\]|px-\[12px\]/,
      );
  });
  it.each(paddingBaselines)("allows only the exact S1 padding class in $path", (baseline) => {
    const text = source(baseline.path);
    expect(text.split(`className="${baseline.after}"`)).toHaveLength(2);
    expect(digest(normalizePadding(text, baseline))).toBe(baseline.sourceDigest);
    expect(digest(nonclassBytes(text))).toBe(baseline.nonclassDigest);
  });
  it("rejects real nonclass AST mutations and any unauthorized presentation changes", () => {
    for (const [index, before, after] of [
      [0, "await auth()", "auth()"],
      [0, "!userId", "userId"],
      [0, "await getUserOrders()", "await getOtherOrders()"],
      [0, "orders.length === 0", "orders.length === 1"],
      [0, "/sign-in?redirect_url=/orders", "/sign-in"],
      [0, "No tenés pedidos aún", "Sin pedidos"],
      [0, "<h1 className=", "<h1 hidden className="],
      [1, "length: 3", "length: 1"],
      [1, "key={i}", "key={j}"],
      [2, 'order.status === "shipped"', 'order.status === "paid"'],
      [2, "order.tracking_number", "order.id"],
      [2, "item.final_cents", "item.original_cents"],
      [2, "product?.title ??", "product?.slug ??"],
      [2, "<OrderPricingHistory order={order}", "<OrderPricingHistory order={other}"],
      [3, 'href="/profile"', 'href="/"'],
      [3, 'aria-current="page"', 'aria-current="step"'],
      [3, "Mi Cuenta", "Otra cuenta"],
      [3, "Mis pedidos", "Otros pedidos"],
      [3, '<span aria-current="page">', '<span aria-current="page" tabIndex={0}>'],
    ] as const) {
      const baseline = paddingBaselines[index];
      const original = source(baseline.path);
      expect(original).toContain(before);
      const changed = original.replace(before, after);
      expect(digest(normalizePadding(changed, baseline))).not.toBe(baseline.sourceDigest);
      expect(digest(nonclassBytes(changed))).not.toBe(baseline.nonclassDigest);
    }
    for (const [index, before, after] of [
      [0, "pb-[42px]", "pb-[30px]"],
      [1, "pb-10", "pb-6"],
      [1, "p-5", "p-3"],
      [2, "text-[48px]", "text-[30px]"],
      [2, "lg:pb-[42px]", "lg:pb-[30px]"],
      [2, "py-[24px]", "py-[12px]"],
      [3, "pb-[6px]", "pb-[18px]"],
      [3, "min-h-[48px]", "min-h-[36px]"],
    ] as const) {
      const baseline = paddingBaselines[index];
      const original = source(baseline.path);
      expect(original).toContain(before);
      const changed = original.replace(before, after);
      expect(digest(normalizePadding(changed, baseline))).not.toBe(baseline.sourceDigest);
      expect(digest(nonclassBytes(changed))).toBe(baseline.nonclassDigest);
    }
  });
  it.each(paddingBaselines)(
    "rejects moved, duplicate and additional approved padding in $path",
    (baseline) => {
      const original = source(baseline.path);
      const approved = `className="${baseline.after}"`;
      const alternate = [...original.matchAll(/className="([^"]*)"/g)].find(
        (match) => match[1] !== baseline.after,
      )![0];
      const moved = original
        .replace(alternate, 'className="__guard_move__"')
        .replace(approved, alternate)
        .replace('className="__guard_move__"', approved);
      const duplicate = original.replace(approved, `${approved} ${approved}`);
      const additional = original.replace(alternate, approved);
      for (const mutation of [moved, duplicate, additional]) {
        expect(mutation).not.toBe(original);
        expect(normalizePadding(mutation, baseline)).toBe(mutation);
        expect(digest(normalizePadding(mutation, baseline))).not.toBe(baseline.sourceDigest);
      }
      // The original authorized-before variant also has the recorded exact identity.
      const before = original.replace(approved, `className="${baseline.before}"`);
      expect(digest(normalizePadding(before, baseline))).toBe(baseline.sourceDigest);
    },
  );
  it("leaves the common layout server-only in composition with no new queries, actions or hooks", () => {
    const file = ts.createSourceFile(
      "layout.tsx",
      layoutSource(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const imports = file.statements
      .filter(ts.isImportDeclaration)
      .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
    expect(imports).toEqual([
      "next/link",
      "react",
      "@/components/cart-drawer",
      "@/components/site-footer",
      "@/components/site-header",
    ]);
    expect(
      file.statements.some(
        (node) => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression),
      ),
    ).toBe(false);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(calls).toHaveLength(0);
  });
  it("proves composed base/md spacing for empty/history/loading via source and in-memory CSS, not mounted layout", async () => {
    const classes = [layoutSource(), ...paddingBaselines.map(({ path }) => source(path))]
      .flatMap((text) => [...text.matchAll(/className="([^"]*)"/g)])
      .flatMap((match) => match[1].split(/\s+/));
    classes.push("py-[18px]", ...paddingBaselines.flatMap(({ before }) => before.split(/\s+/)));
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build(classes);
    const utility = (name: string) => {
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
    for (const [name, declaration] of [
      ["min-h-[48px]", "min-height: 48px;"],
      ["flex-wrap", "flex-wrap: wrap;"],
      ["gap-[6px]", "gap: 6px;"],
      ["px-[18px]", "padding-inline: 18px;"],
      ["pt-[18px]", "padding-top: 18px;"],
      ["pb-[6px]", "padding-bottom: 6px;"],
      ["md:pb-[12px]", "padding-bottom: 12px;"],
      ["pt-0", "padding-top: calc(var(--spacing) * 0);"],
      ["pb-[42px]", "padding-bottom: 42px;"],
      ["pb-10", "padding-bottom: calc(var(--spacing) * 10);"],
      ["md:px-[30px]", "padding-inline: 30px;"],
      ["flex", "display: flex;"],
      ["md:mx-auto", "margin-inline: auto;"],
      ["md:max-w-[1200px]", "max-width: 1200px;"],
      ["focus-visible:outline-2", "outline-width: 2px;"],
      ["focus-visible:outline-solid", "outline-style: solid;"],
      ["focus-visible:outline-offset-2", "outline-offset: 2px;"],
      ["focus-visible:outline-midnight-ink", "outline-color: var(--color-midnight-ink);"],
      ["font-mono", "font-family: var(--font-ibm-plex-mono);"],
    ])
      expect(utility(name)).toContain(declaration);
    expect(utility("flex-wrap")).not.toContain("@media");
    expect(utility("gap-[6px]")).not.toContain("@media");
    expect(utility("md:px-[30px]")).toContain("@media (width >= 48rem)");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    expect(utility("md:pb-[12px]")).toContain("@media (width >= 48rem)");
    expect(utility("md:mx-auto")).toContain("@media (width >= 48rem)");
    expect(utility("md:max-w-[1200px]")).toContain("@media (width >= 48rem)");
    const spacing = css.match(/--spacing:\s*([\d.]+)rem;/)!;
    expect(spacing).not.toBeNull();
    const spacingPx = Number(spacing[1]) * 16;
    // Evaluate only actual compiled padding declarations, in emitted cascade order.
    const padding = (className: string, md: boolean) => {
      const result = { top: 0, bottom: 0 };
      const names = className.split(/\s+/).filter((name) => /^(?:md:)?(?:p|py|pt|pb)-/.test(name));
      const rules = names
        .filter((name) => md || !name.startsWith("md:"))
        .map((name) => utility(name)!)
        .sort((a, b) => css.indexOf(a) - css.indexOf(b));
      for (const rule of rules) {
        for (const [, property, value] of rule.matchAll(
          /(padding(?:-block|-top|-bottom)?): ([^;]+);/g,
        )) {
          const factor = value.match(/^calc\(var\(--spacing\) \* (\d+)\)$/);
          expect(factor || /^\d+px$/.test(value), value).toBeTruthy();
          const px = factor ? spacingPx * Number(factor[1]) : Number.parseFloat(value);
          if (["padding", "padding-block", "padding-top"].includes(property)) result.top = px;
          if (["padding", "padding-block", "padding-bottom"].includes(property)) result.bottom = px;
        }
      }
      return result;
    };
    const wrapper = descendants(OrdersLayout({ children: <section /> })).find(
      (node) =>
        node.type === "div" &&
        isValidElement(node.props.children) &&
        node.props.children.type === "nav",
    )!;
    const loading = descendants(Loading()).find((node) =>
      node.props.className?.includes("container"),
    )!;
    const states: [string, string, number][] = [
      ["history", OrdersPageContent({ orders: [order] }).props.className, 42],
      ["loading", loading.props.className!, 40],
    ];
    for (const orders of [null, []]) {
      probe.orders.mockResolvedValue(orders);
      states.push([orders === null ? "null" : "empty", (await OrdersPage()).props.className, 42]);
    }
    for (const md of [false, true]) {
      const breadcrumb = padding(wrapper.props.className!, md);
      const previousBreadcrumb = padding("w-full px-[18px] py-[18px] md:px-[30px]", md);
      expect(breadcrumb.top).toBe(previousBreadcrumb.top);
      expect(breadcrumb.top).toBe(18);
      for (const [state, className, bottom] of states) {
        const previousContent = padding(
          paddingBaselines.find(({ after }) => after === className)!.before,
          md,
        );
        expect(padding(className, md), state).toEqual({ top: 0, bottom });
        expect(previousContent.bottom, state).toBe(bottom);
        const previousGap = previousBreadcrumb.bottom + previousContent.top;
        const currentGap = breadcrumb.bottom + padding(className, md).top;
        expect(previousGap, state).toBe(state === "loading" ? 58 : 60);
        expect(currentGap, `${state}/${md ? "md" : "base"}`).toBe(md ? 12 : 6);
        expect(currentGap, state).toBeLessThan(previousGap);
      }
    }
    // Empty content starts with its existing package icon, not the heading.
    // Its 60px line box and 24px internal gap remain; only the outer gap shrinks.
    expect(utility("leading-[1]")).toContain("--tw-leading: 1;");
    expect(utility("text-[60px]")).toContain("font-size: 60px;");
    expect(utility("space-y-[24px]")).toContain("24px");
  });
});
