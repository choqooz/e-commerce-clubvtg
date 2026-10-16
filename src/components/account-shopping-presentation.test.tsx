import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TryOnHistoryItem } from "@/lib/actions/credits";
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import { formatHistoricalOrderTotal } from "./orders/order-pricing-history";
import { OrdersPageContent } from "./orders/orders-page-content";
import { ProfilePageContent } from "./profile/profile-page-content";
import { TryOnHistory } from "./try-on/try-on-history";

// Isolated service/chrome/history boundaries: no auth, effects, database or network.
// The real Button, Badge, pricing-history component and navigation render normally.
const probe = vi.hoisted(() => ({ openUserProfile: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => probe }));
vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => {
    // Plain image only at this isolated SSR mock boundary; production uses next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header data-chrome="header" /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer data-chrome="footer" /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => <aside data-chrome="cart" /> }));
vi.mock("@/components/try-on/try-on-history", () => ({
  TryOnHistory: ({ items }: { items: TryOnHistoryItem[] }) => (
    <div data-history-count={items.length} />
  ),
}));
beforeEach(() => vi.clearAllMocks());

const paths = [
  "src/components/profile/profile-page-content.tsx",
  "src/components/orders/orders-page-content.tsx",
] as const;
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Captured from the live, accepted pretask bytes BEFORE the first V4 source edit.
// Not HEAD, and never recomputed from the implementation to bless new behavior.
// Full syntax/guard preservation also remains in checkout-account's original AST
// comparison. This additional digest protects the ordered business tokens/copy
// independently of the deliberate grouping/heading changes.
const PRETASK_BUSINESS_DIGESTS = [
  "d1fd9e80af181273afaffcd4fb1873e7bcfcafdf15a370408599978c4885763b",
  "0f58a3e113bc9d10fa80950c81071fb8e97f115839636c800edfbc5255945ca7",
];
function businessDigest(text: string): string {
  const file = parse(text);
  const values: unknown[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className")
      return;
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "className") return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      node.attributes.properties.forEach(visit);
      return;
    }
    if (ts.isJsxClosingElement(node)) return;
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
      if (text) values.push(["text", text]);
      return;
    }
    if (
      ts.isIdentifier(node) ||
      ts.isLiteralExpression(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      values.push([node.kind, node.text]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
const originalGroupingAttributes = (text: string) =>
  text
    // R1 restores only the EXACT approved intro and display-name heading role.
    // Different intro copy, name expressions or nonclass props remain observable.
    .replace(
      /<div className="[^"]*">\s*<h1 className="[^"]*">\s*Mi cuenta\s*<\/h1>\s*<p className="[^"]*">\s*Gestioná tus datos, pedidos y créditos\s*<\/p>\s*<\/div>/,
      "",
    )
    .replace(/<h2 (className="[^"]*")>(\s*\{displayName\}\s*)<\/h2>/, "<h1 $1>$2</h1>")
    .replace(/\s+(?:id|aria-labelledby)="profile-(?:balance|links|history)-heading"/g, "");

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const user = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "buyer@example.test",
  imageUrl: "/identity.jpg",
  emailVerified: true,
};
const history = [{ id: "history-fixture" }] as TryOnHistoryItem[];
const mutableCatalogProduct = {
  image_urls: ["/garment.jpg"],
  price: 12000,
  slug: "prenda",
  title: "Prenda de lino con un nombre largo y legible sin truncamiento",
};
const order: OrderHistoryOrder = {
  clerk_anonymized_at: null,
  coupon_definitions: [{ code: "AHORRO20" }],
  created_at: "2026-08-30T12:00:00Z",
  customer_email: "buyer@example.test",
  customer_name: "Ada",
  id: "order-12345678",
  merchandise_discount_cents: 200000,
  merchandise_final_cents: 800000,
  merchandise_original_cents: 1000000,
  mp_payment_id: null,
  mp_preference_id: null,
  order_items: [
    {
      discount_cents: 0,
      final_cents: 990000,
      id: "item-fixture",
      order_id: "order-12345678",
      original_cents: 990000,
      price: 9900,
      pricing_source: "coupon",
      product_id: "product-fixture",
      products: mutableCatalogProduct,
    },
  ],
  payment_amount_cents: 850000,
  pricing_source: "coupon",
  product_payment_reversal_evidence: [],
  promotion_ids: [],
  shipping_cents: 50000,
  shipping_fee: 500,
  shipping_info: null,
  shipped_at: null,
  status: "paid",
  total_amount: 8500,
  total_cents: 850000,
  tracking_number: null,
  updated_at: "2026-08-30T12:00:00Z",
  user_id: "fixture-user",
};

// Actual parent BEFORE T3, /tmp/breadcrumb-alignment-parent-ifm0f46e.
// Restore only these five positioned attributes; all other bytes (including JSX
// whitespace, template quasis, callbacks and card classes) remain observable.
const breadcrumbNav =
  "flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono";
const alignedNav = `${breadcrumbNav} md:mx-auto md:max-w-[1200px]`;
const t3Surfaces = [
  {
    path: paths[0],
    parentHash: "176404e29d0f8b5dd27738aa65f7d7a056ab078be26d150f0c7cb71b46af474f",
    slots: [
      {
        name: "profile breadcrumb wrapper",
        position: [15, 3, 2, 0, 0, 6, 4, 0, 1, 0],
        before: "w-full px-[18px] py-[18px] md:px-[30px]",
        after: "w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]",
      },
      {
        name: "profile breadcrumb nav",
        position: [15, 3, 2, 0, 0, 6, 4, 2, 0, 1, 0],
        before: breadcrumbNav,
        after: alignedNav,
      },
      {
        name: "profile identity header",
        position: [15, 3, 2, 0, 0, 6, 6, 4, 4, 0, 1, 0],
        before:
          "grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-start gap-[18px] py-[24px] md:pt-0 lg:col-span-12 lg:gap-[30px] lg:pb-[42px]",
        after:
          "grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-start gap-[18px] pt-0 pb-[24px] md:pt-0 lg:col-span-12 lg:gap-[30px] lg:pb-[42px]",
      },
    ],
  },
  {
    path: "src/app/orders/layout.tsx",
    parentHash: "9f98af1625bbca574fd943fb65d01bff0b5a1050211c000d7b937a4431e82a5a",
    slots: [
      {
        name: "orders breadcrumb nav",
        position: [5, 4, 0, 0, 0, 6, 2, 2, 0, 1, 1],
        before: breadcrumbNav,
        after: alignedNav,
      },
    ],
  },
  {
    path: "src/components/credits/credits-page-content.tsx",
    parentHash: "9ee122478b81d48b63b62029aeb4ac85a4f86e8a5ad45bb9ea7912f5c859e192",
    slots: [
      {
        name: "credits breadcrumb nav",
        position: [15, 3, 3, 0, 0, 6, 4, 2, 0, 1, 0],
        before: breadcrumbNav,
        after: alignedNav,
      },
    ],
  },
];
function beforeT3(text: string, surface: (typeof t3Surfaces)[number]): string | null {
  const file = parse(text);
  const edits: { start: number; end: number; before: string }[] = [];
  for (const slot of surface.slots) {
    let target: ts.Node | undefined = file;
    for (const index of slot.position) {
      const children: ts.Node[] = [];
      if (target)
        ts.forEachChild(target, (child) => {
          children.push(child);
        });
      target = children[index];
    }
    const matches: ts.JsxAttribute[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(file) === "className" &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        [slot.before, slot.after].includes(node.initializer.text)
      )
        matches.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    if (
      matches.length !== 1 ||
      matches[0] !== target ||
      !target ||
      !ts.isJsxAttribute(target) ||
      !target.initializer ||
      !ts.isStringLiteral(target.initializer)
    )
      return null;
    edits.push({ start: target.getStart(file), end: target.getEnd(), before: slot.before });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + `className="${edit.before}"` + text.slice(edit.end);
  return text;
}
const byteHash = (text: string | null) =>
  text === null ? null : createHash("sha256").update(text).digest("hex");

describe("T3 exact five-slot parent preservation", () => {
  it.each(t3Surfaces)("retains every other parent byte in $path", (surface) => {
    const current = source(surface.path);
    for (const slot of surface.slots)
      expect(current.split(`className="${slot.after}"`)).toHaveLength(2);
    const before = beforeT3(current, surface);
    expect(before).not.toBeNull();
    expect(byteHash(before)).toBe(surface.parentHash);
    expect(beforeT3(before!, surface)).toBe(before);
  });
  it.each(t3Surfaces.flatMap((surface) => surface.slots.map((slot) => ({ surface, slot }))))(
    "rejects wrong, moved and duplicate $slot.name classes",
    ({ surface, slot }) => {
      const current = source(surface.path);
      const valid = beforeT3(current, surface);
      expect(valid).not.toBeNull();
      expect(byteHash(valid)).toBe(surface.parentHash);
      const approved = `className="${slot.after}"`;
      const alternate = [...current.matchAll(/className="[^"]*"/g)].find(
        (match) => !surface.slots.some((entry) => match[0] === `className="${entry.after}"`),
      )![0];
      const moved = current
        .replace(alternate, 'className="__moved__"')
        .replace(approved, alternate)
        .replace('className="__moved__"', approved);
      for (const mutation of [
        current.replace(approved, `className="${slot.after} w-fit"`),
        current.replace(approved, `${approved} ${approved}`),
        current.replace(alternate, approved),
        moved,
      ]) {
        expect(mutation).not.toBe(current);
        expect(beforeT3(mutation, surface)).toBeNull();
      }
    },
  );
  it.each([
    [0, "openUserProfile()", "closeUserProfile()"],
    [0, "Gestioná tus datos, pedidos y créditos", "Gestioná tus datos y pedidos"],
    [0, "lg:gap-y-[42px]", "lg:gap-y-[30px]"],
    [1, 'href="/profile"', 'href="/"'],
    [1, "pb-[6px]", "pb-[18px]"],
    [2, "router.push(result.url)", "router.replace(result.url)"],
    [2, "py-[18px]", "py-[6px]"],
  ] as const)("rejects protected callback/copy/geometry mutation %s / %s", (index, from, to) => {
    const surface = t3Surfaces[index];
    const current = source(surface.path);
    const valid = beforeT3(current, surface);
    expect(valid).not.toBeNull();
    expect(byteHash(valid)).toBe(surface.parentHash);
    expect(current).toContain(from);
    const mutation = current.replace(from, to);
    expect(mutation).not.toBe(current);
    expect(byteHash(beforeT3(mutation, surface))).not.toBe(surface.parentHash);
  });
});

describe("V4 immutable pretask preservation", () => {
  it.each(paths)("retains business tokens, props and ordered Spanish copy in %s", (path) => {
    expect(businessDigest(originalGroupingAttributes(source(path)))).toBe(
      PRETASK_BUSINESS_DIGESTS[paths.indexOf(path)],
    );
  });
  it("does not bless callback, price, URL, date, fallback or copy mutations", () => {
    for (const [path, before, after] of [
      [paths[0], "openUserProfile()", "closeUserProfile()"],
      [paths[0], "credits === 1", "credits === 2"],
      [paths[0], '"Usuario"', '"Invitado"'],
      [paths[0], 'href="/credits"', 'href="/orders"'],
      [paths[0], "Cada prueba virtual consume 1 crédito", "Cada prueba virtual consume 2 créditos"],
      [paths[1], "item.final_cents", "item.original_cents"],
      [paths[1], "order.created_at", "order.updated_at"],
      [paths[1], '"es-AR"', '"en-US"'],
      [paths[1], "order.tracking_number", "order.id"],
    ]) {
      const original = source(path);
      expect(original).toContain(before);
      expect(businessDigest(originalGroupingAttributes(original.replace(before, after)))).not.toBe(
        businessDigest(originalGroupingAttributes(original)),
      );
    }
  });
  it("does not bless altered approved intro copy, name expressions or nonclass props", () => {
    const original = source(paths[0]);
    for (const [before, after] of [
      ["Mi cuenta", "Tu cuenta"],
      ["Gestioná tus datos, pedidos y créditos", "Gestioná tus datos y compras"],
      ["<h1 className=", "<h1 hidden className="],
      ["<h2 className=", '<h2 aria-hidden="true" className='],
    ]) {
      const candidate = original.replace(before, after);
      expect(candidate).not.toBe(original);
      expect(businessDigest(originalGroupingAttributes(candidate))).not.toBe(
        businessDigest(originalGroupingAttributes(original)),
      );
    }
  });
});

describe("V4 editorial account grouping (shallow/SSR, not real auth)", () => {
  it.each([
    { firstName: null, lastName: null, expected: "Usuario" },
    { firstName: "Ada", lastName: null, expected: "Ada" },
    { firstName: null, lastName: "Lovelace", expected: "Lovelace" },
    { firstName: "Ada", lastName: "Lovelace", expected: "Ada Lovelace" },
  ])("keeps identity fallback: $expected", ({ firstName, lastName, expected }) => {
    const markup = html(
      <ProfilePageContent user={{ ...user, firstName, lastName }} credits={1} tryOnHistory={[]} />,
    );
    expect(markup).toMatch(new RegExp(`<h2[^>]*>${expected}</h2>`));
    expect(markup).toContain(`alt="${expected}"`);
    expect(markup).toContain(user.email);
    expect(markup).toContain('src="/identity.jpg"');
  });
  it.each([false, true])("keeps verification badge state: %s", (emailVerified) => {
    const markup = html(
      <ProfilePageContent user={{ ...user, emailVerified }} credits={0} tryOnHistory={[]} />,
    );
    expect(markup).toContain(emailVerified ? "Email verificado" : "Verificar email");
    expect(markup).not.toContain(emailVerified ? "Verificar email" : "Email verificado");
  });
  it.each([0, 1, 7])("keeps balance and singular/plural at %s credits", (credits) => {
    const tree = ProfilePageContent({ user, credits, tryOnHistory: history });
    const markup = html(tree);
    expect(markup).toContain(`>${credits}<span`);
    expect(markup).toContain(credits === 1 ? ">crédito</span>" : ">créditos</span>");
    expect(markup).toContain("Cada prueba virtual consume 1 crédito");
    expect(descendants(tree).find((element) => element.type === TryOnHistory)?.props.items).toBe(
      history,
    );
    expect(markup).toContain('data-history-count="1"');
    expect(probe.openUserProfile).not.toHaveBeenCalled();
  });
  it("groups identity/actions, balance, navigation and full-width history without changing destinations", () => {
    const tree = ProfilePageContent({ user, credits: 2, tryOnHistory: [] });
    const nodes = descendants(tree);
    const identity = nodes.find((element) => element.type === "header")!;
    expect(identity.props.className).toContain("lg:col-span-12");
    expect(nodes.filter((element) => element.type === "h1")).toHaveLength(1);
    expect(descendants(identity).filter((element) => element.type === "h2")).toHaveLength(1);
    const manage = descendants(identity).find(
      (element) => typeof element.props.onClick === "function",
    )!;
    expect(manage.props.className).toContain("min-h-[48px]");
    expect(probe.openUserProfile).not.toHaveBeenCalled();
    (manage.props.onClick as () => void)();
    expect(probe.openUserProfile).toHaveBeenCalledExactlyOnceWith();
    const groups = nodes.filter((element) => element.type === "section");
    expect(groups.map((element) => element.props["aria-labelledby"])).toEqual([
      "profile-balance-heading",
      "profile-links-heading",
      "profile-history-heading",
    ]);
    for (const group of groups)
      expect(descendants(group).find((element) => element.type === "h2")?.props.id).toBe(
        group.props["aria-labelledby"],
      );
    expect(groups[0].props.className).toContain("lg:col-span-5");
    expect(groups[1].props.className).toContain("lg:col-span-7");
    expect(groups[2].props.className).toContain("lg:col-span-12");
    const markup = html(tree);
    for (const copy of [
      "Inicio",
      "Mi Perfil",
      "Gestionar cuenta",
      "Tu balance",
      "Comprar más créditos",
      "Accesos rápidos",
      "Mis Pedidos",
      "Catálogo",
      "Créditos",
      "Mis pruebas virtuales",
    ])
      expect(markup).toContain(copy);
    expect((markup.match(/href="\/credits"/g) ?? []).length).toBe(2);
    expect(markup).toContain('href="/orders"');
    expect(markup).toContain('href="/"');
    for (const chrome of ["header", "cart", "footer"])
      expect(markup.match(new RegExp(`data-chrome="${chrome}"`, "g"))).toHaveLength(1);
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<main\b[^>]*>[\s\S]*<main\b/);
  });
});

describe("V4 readable order summaries and tracking", () => {
  it.each([
    { status: "pending" as const, label: "Pendiente" },
    { status: "paid" as const, label: "Pagado" },
    { status: "shipped" as const, label: "Enviado" },
    { status: "cancelled" as const, label: "Cancelado" },
  ])("keeps $status summary, Spanish date and immutable prices", ({ status, label }) => {
    const markup = html(<OrdersPageContent orders={[{ ...order, status }]} />);
    expect(markup).toMatch(/<h1[^>]*>Mis Pedidos<\/h1>/);
    expect(markup).toMatch(/<article[^>]*><header/);
    expect(markup).toMatch(/<h2[^>]*>#order-12<\/h2>/);
    expect(markup).toContain(label);
    expect(markup).toContain(
      new Date(order.created_at).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
    expect(markup).toContain('href="/product/prenda"');
    expect(markup).toContain(order.order_items[0].products!.title);
    expect(markup).not.toContain("line-clamp");
    expect(markup).toContain("Fuente aplicada: Cupón AHORRO20");
    expect(markup).toContain(
      formatHistoricalOrderTotal({ total_amount: 9900, total_cents: 990000 }),
    );
    const footer = markup.match(/<footer[^>]*>([\s\S]*?)<\/footer>/)?.[1];
    expect(footer).toBeDefined();
    expect(footer).toContain("1 producto");
    expect(footer).toContain(`${formatHistoricalOrderTotal(order)}</span>`);
  });
  it.each([
    { status: "shipped" as const, tracking: "TRACK-".repeat(20), visible: true },
    { status: "shipped" as const, tracking: null, visible: false },
    { status: "shipped" as const, tracking: "", visible: false },
    { status: "pending" as const, tracking: "TRACK", visible: false },
    { status: "paid" as const, tracking: "TRACK", visible: false },
    { status: "cancelled" as const, tracking: "TRACK", visible: false },
  ])("keeps tracking guard/link for $status / $tracking", ({ status, tracking, visible }) => {
    const markup = html(
      <OrdersPageContent orders={[{ ...order, status, tracking_number: tracking }]} />,
    );
    expect(markup.includes("Número de seguimiento:")).toBe(visible);
    expect(markup.includes("Rastrear")).toBe(visible);
    if (visible) {
      expect(markup).toContain(
        `href="https://www.correoargentino.com.ar/formularios/e-comercio?id=${tracking}"`,
      );
      expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
      expect(markup).toContain("min-h-[48px] w-full");
      expect(markup).toContain("break-all");
    }
  });
  it("keeps image/title/slug fallbacks, plural counts and empty-order behavior", () => {
    const markup = html(
      <OrdersPageContent
        orders={[
          {
            ...order,
            order_items: [
              { ...order.order_items[0], products: null },
              {
                ...order.order_items[0],
                id: "second",
                products: { image_urls: ["/orphan.jpg"], title: "Sin enlace", slug: "" },
              },
            ],
          },
        ]}
      />,
    );
    expect(markup).toContain("lucide-package");
    expect(markup).toContain("2 productos");
    expect(markup).toContain('href="#"');
    expect(markup).toContain('alt="Sin enlace"');
    expect(markup).toContain(">Producto</span>");
    expect(markup).not.toContain('href="/product/"');
    const empty = html(<OrdersPageContent orders={[]} />);
    expect(empty).toContain("Mis Pedidos");
    expect(empty).not.toContain("<article");
    expect(empty).not.toContain("Rastrear");
  });
});

describe("V4 in-memory responsive/touch typography", () => {
  it("compiles actual source geometry, wrapping, focus and restrained surfaces", async () => {
    const classes = new Set<string>();
    for (const path of paths) {
      // P1's sole radius exception is this exact identity Image, not other surfaces.
      const original = source(path);
      const text =
        path === paths[0]
          ? original.replace(
              /(<Image\s+src=\{user.imageUrl\}\s+alt=\{displayName\}\s+width=\{96\}\s+height=\{96\}\s+className="size-\[96px\] )rounded-full(?= object-cover row-span-1 md:row-span-2")/,
              "$1rounded-none",
            )
          : original;
      expect(text).toContain("max-w-[1200px]");
      const visit = (node: ts.Node) => {
        if (
          (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
          node.name.getText() === "className"
        ) {
          const collect = (child: ts.Node) => {
            if (ts.isStringLiteral(child))
              child.text.split(/\s+/).forEach((value) => classes.add(value));
            ts.forEachChild(child, collect);
          };
          collect(node);
        } else ts.forEachChild(node, visit);
      };
      visit(parse(text));
    }
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|line-clamp|rounded-(?!none)|font-(bold|semibold|medium)|(?:bg|text|border)-(?:red|green|blue)-/,
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
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
      throw new Error(`Unbalanced CSS utility: ${name}`);
    };
    for (const [name, property, value] of [
      ["min-h-[48px]", "min-height", "48px"],
      ["min-h-[60px]", "min-height", "60px"],
      ["w-[80px]", "width", "80px"],
      ["h-[100px]", "height", "100px"],
      ["max-w-[1200px]", "max-width", "1200px"],
      ["gap-[30px]", "gap", "30px"],
      ["p-[24px]", "padding", "24px"],
      ["lg:p-[36px]", "padding", "36px"],
      ["text-[48px]", "font-size", "48px"],
      ["lg:text-[72px]", "font-size", "72px"],
      ["lg:grid-cols-12", "grid-template-columns", "repeat(12, minmax(0, 1fr))"],
      [
        "lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]",
        "grid-template-columns",
        "minmax(0,1fr) minmax(300px,0.65fr)",
      ],
      ["break-all", "word-break", "break-all"],
      ["focus-visible:outline-2", "outline-width", "2px"],
    ])
      expect(utility(name), name).toContain(`${property}: ${value};`);
    for (const [name, width] of [
      ["sm:w-auto", "40rem"],
      ["lg:grid-cols-12", "64rem"],
      ["lg:hidden", "64rem"],
    ])
      expect(utility(name)).toContain(`@media (width >= ${width})`);
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    console.info(
      `V4 CSS: ${classes.size} source candidates; 14 declarations, 3 media and focus verified in memory.`,
    );
  });
});
