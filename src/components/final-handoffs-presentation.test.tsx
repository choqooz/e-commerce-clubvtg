import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Local boundaries only: no Clerk session, database, Next navigation, DOM submit or fetch.
const probe = vi.hoisted(() => ({
  auth: vi.fn(),
  orders: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  refs: [] as { current: unknown }[],
  effects: [] as { run: () => void; deps: unknown }[],
  fetch: vi.fn(() => {
    throw new Error("Unexpected network request");
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: probe.auth }));
vi.mock("@/lib/actions/orders", () => ({ getUserOrders: probe.orders }));
vi.mock("next/navigation", () => ({ redirect: probe.redirect }));
vi.mock("next/link", () => ({
  default: (props: { href: string; children: ReactNode }) => <a {...props} />,
}));
vi.mock("@/components/orders/orders-page-content", () => ({
  OrdersPageContent: ({ orders }: { orders: { id: string }[] }) => (
    <section data-orders>
      {orders.map((order) => (
        <p key={order.id}>{order.id}</p>
      ))}
    </section>
  ),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (initial: unknown) => {
    const ref = { current: initial };
    probe.refs.push(ref);
    return ref;
  },
  useEffect: (run: () => void, deps: unknown) => {
    probe.effects.push({ run, deps });
  },
}));
import OrdersPage from "@/app/orders/page";
import { OrdersPageContent } from "./orders/orders-page-content";
import { CreditPaymentReconciliationHandoff } from "./credit-payment-reconciliation-handoff";

beforeEach(() => {
  vi.clearAllMocks();
  probe.auth.mockReset().mockResolvedValue({ userId: "fixture-user" });
  probe.orders.mockReset().mockResolvedValue([]);
  probe.refs = [];
  probe.effects = [];
  vi.stubGlobal("fetch", probe.fetch);
});
afterEach(() => {
  try {
    expect(probe.fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "src/app/orders/page.tsx",
  "src/components/credit-payment-reconciliation-handoff.tsx",
];
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Ignore only classes and JSX formatting. Guards, async awaits, copy, metadata,
// form method/action/hidden intent, refs and the once-only effect remain authoritative.
function behavior(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression);
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className")
    return undefined;
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
    ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text : null,
    children,
  ];
}
type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const handoff = (intentId = "fixture-intent") => CreditPaymentReconciliationHandoff({ intentId });

function classesByTag(text: string) {
  const result = new Map<string, string[]>();
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attribute = node.attributes.properties.find(
        (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === "className",
      );
      if (
        attribute &&
        ts.isJsxAttribute(attribute) &&
        attribute.initializer &&
        ts.isStringLiteral(attribute.initializer)
      ) {
        const tag = node.tagName.getText();
        result.set(tag, [...(result.get(tag) ?? []), ...attribute.initializer.text.split(/\s+/)]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return result;
}

describe("G56C4 class-only preservation", () => {
  it.each(paths)(
    "preserves nonpresentation AST relative to the original pre-redesign baseline: %s",
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
  it("rejects guard, await, endpoint, method, hidden name/value, ref/effect and copy changes", () => {
    const original =
      'async function Page() { const user = await auth(); if (!user) redirect("/sign-in"); useEffect(() => { if (!form.current || submitted.current) return; submitted.current = true; form.current.requestSubmit(); }, []); return <form className="old" action="/reconcile" method="post" ref={form}><input name="intent_id" type="hidden" value={intentId} />Verificar pago</form>; }';
    expect(behavior(parse(original.replace('className="old"', 'className="new"')))).toEqual(
      behavior(parse(original)),
    );
    for (const [before, after] of [
      ["await auth()", "auth()"],
      ["!user", "user"],
      ["/sign-in", "/orders"],
      ["/reconcile", "/other"],
      ['method="post"', 'method="get"'],
      ["intent_id", "order_id"],
      ["intentId", "orderId"],
      ["ref={form}", "ref={other}"],
      ["submitted.current = true", "submitted.current = false"],
      ["requestSubmit()", "submit()"],
      ["Verificar pago", "Pagar"],
    ])
      expect(behavior(parse(original.replace(before, after)))).not.toEqual(
        behavior(parse(original)),
      );
  });
});

describe("Actual server orders page with isolated auth/data/content boundaries", () => {
  it("redirects unauthenticated users before requesting orders", async () => {
    probe.auth.mockResolvedValue({ userId: null });
    await expect(OrdersPage()).rejects.toThrow("redirect:/sign-in?redirect_url=/orders");
    expect(probe.redirect).toHaveBeenCalledExactlyOnceWith("/sign-in?redirect_url=/orders");
    expect(probe.orders).not.toHaveBeenCalled();
  });
  it.each([null, []])(
    "keeps empty/null copy and real Button asChild catalog anchor: %j",
    async (orders) => {
      probe.orders.mockResolvedValue(orders);
      const markup = html(await OrdersPage());
      expect(markup).toContain("📦");
      expect(markup).toContain("No tenés pedidos aún");
      expect(markup).toContain(
        "Cuando hagas tu primera compra, vas a poder ver el estado de tus pedidos acá.",
      );
      expect(markup).toMatch(/<a[^>]*href="\/"[^>]*>Explorar catálogo<\/a>/);
      expect(markup).not.toContain("<button");
      expect(markup).toContain("font-mono");
      expect(markup).toContain("focus-visible:outline-2");
      expect(probe.auth).toHaveBeenCalledExactlyOnceWith();
      expect(probe.orders).toHaveBeenCalledExactlyOnceWith();
      expect(probe.redirect).not.toHaveBeenCalled();
    },
  );
  it("passes nonempty results unchanged to the existing content component", async () => {
    const orders = [{ id: "fixture-order", items: [], total_amount: 123 }];
    probe.orders.mockResolvedValue(orders);
    const tree = await OrdersPage();
    expect(tree.type).toBe(OrdersPageContent);
    expect(tree.props.orders).toBe(orders);
    expect(html(tree)).toContain("fixture-order");
    expect(html(tree)).not.toContain("No tenés pedidos aún");
  });
  it("awaits auth before the data query and awaits data before rendering", async () => {
    let resolveAuth!: (value: unknown) => void;
    let resolveOrders!: (value: unknown) => void;
    probe.auth.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );
    probe.orders.mockReturnValue(
      new Promise((resolve) => {
        resolveOrders = resolve;
      }),
    );
    let rendered = false;
    const pending = OrdersPage().then((tree) => {
      rendered = true;
      return tree;
    });
    expect(probe.orders).not.toHaveBeenCalled();
    resolveAuth({ userId: "fixture-user" });
    await Promise.resolve();
    expect(probe.orders).toHaveBeenCalledOnce();
    expect(rendered).toBe(false);
    resolveOrders([]);
    expect(html(await pending)).toContain("No tenés pedidos aún");
  });
  it.each(["auth", "orders"] as const)(
    "does not replace %s errors with empty content",
    async (boundary) => {
      probe[boundary].mockRejectedValue(new Error("fixture failure"));
      await expect(OrdersPage()).rejects.toThrow("fixture failure");
      if (boundary === "auth") expect(probe.orders).not.toHaveBeenCalled();
    },
  );
});

describe("Actual credit handoff SSR and shallow form/effect fixtures", () => {
  it.each(["fixture-intent", "", 'intent&"<fixture>'])(
    "keeps hidden intent, manual fallback and copy: %s",
    (intentId) => {
      const tree = handoff(intentId);
      const elements = descendants(tree);
      const form = elements.find((element) => element.type === "form")!;
      expect(form.props).toMatchObject({
        action: "/api/mp-return/credits/reconcile",
        method: "post",
        ref: probe.refs[0],
      });
      expect(form.props.onSubmit).toBeUndefined();
      expect(elements.find((element) => element.type === "input")!.props).toMatchObject({
        name: "intent_id",
        type: "hidden",
        value: intentId,
      });
      expect(elements.find((element) => element.type === "button")!.props).toMatchObject({
        type: "submit",
        children: "Verificar pago",
      });
      const markup = html(tree);
      expect(markup).toContain("Verificando el pago");
      expect(markup).toContain(
        "Estamos confirmando el estado de tu compra de créditos. Esto puede demorar unos instantes.",
      );
      expect(markup).not.toMatch(/disabled=|aria-busy=|<noscript|onSubmit=/);
      expect(probe.refs.map((ref) => ref.current)).toEqual([null, false]);
      expect(probe.effects).toHaveLength(1);
      expect(probe.effects[0].deps).toEqual([]);
    },
  );
  it("marks submitted before requesting the mock form exactly once", () => {
    handoff();
    const requestSubmit = vi.fn(() => {
      expect(probe.refs[1].current).toBe(true);
    });
    probe.refs[0].current = { requestSubmit };
    probe.effects[0].run();
    probe.effects[0].run();
    expect(requestSubmit).toHaveBeenCalledExactlyOnceWith();
  });
  it("does not consume the once-only flag without a form", () => {
    handoff();
    probe.effects[0].run();
    expect(probe.refs[1].current).toBe(false);
    const requestSubmit = vi.fn();
    probe.refs[0].current = { requestSubmit };
    probe.effects[0].run();
    expect(requestSubmit).toHaveBeenCalledOnce();
  });
  it("matches the accepted product handoff presentation without sharing business code", () => {
    const credit = classesByTag(source(paths[1]));
    const product = classesByTag(source("src/components/payment-reconciliation-handoff.tsx"));
    for (const tag of ["main", "form", "h1", "p", "button"])
      expect(
        credit
          .get(tag)!
          .filter((value) => value !== "rounded-none")
          .sort(),
        tag,
      ).toEqual(product.get(tag)!.slice().sort());
  });
});

describe("Installed Tailwind CSS compiled only in memory", () => {
  it("proves pixel bounds, regular typography, neutral square hairlines and visible focus", async () => {
    const classes = new Set(
      paths.flatMap((path) => [...classesByTag(source(path)).values()].flat()),
    );
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|rounded-(?!none)|font-(bold|medium|semibold|light)|tracking-|(?:bg|text|border)-(?:primary|muted|red|green|blue)/,
    );
    // Include the real accepted Button's rendered anchor classes, not a primitive reimplementation.
    for (const match of html(await OrdersPage()).matchAll(/class="([^"]*)"/g))
      match[1].split(/\s+/).forEach((value) => classes.add(value));
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
      throw new Error(`Unbalanced utility: ${name}`);
    };
    const checks = [
      ["w-full", "width", "100%"],
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["max-w-[448px]", "max-width", "448px"],
      ["max-w-[576px]", "max-width", "576px"],
      ["min-h-[60vh]", "min-height", "60vh"],
      ["min-h-[36px]", "min-height", "36px"],
      ["h-[36px]", "height", "36px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["py-[42px]", "padding-block", "42px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[2px]", "padding-block", "2px"],
      ["space-y-[24px]", "--tw-space-y-reverse", "0"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-midnight-ink", "background-color", "var(--color-midnight-ink)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["text-bone-white", "color", "var(--color-bone-white)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[15px]", "font-size", "15px"],
      ["text-[30px]", "font-size", "30px"],
      ["text-[60px]", "font-size", "60px"],
      ["leading-[1.2]", "line-height", "1.2"],
      ["leading-[1.3]", "line-height", "1.3"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), name).toContain(`${property}: ${value};`);
    expect(utility("space-y-[24px]")).toContain("24px");
    expect(utility("space-y-[6px]")).toContain("6px");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    expect(utility("hover:underline")).toContain("&:hover");
    expect(utility("hover:underline")).toContain("text-decoration-line: underline");
    expect(css).toContain("--color-midnight-ink: #000000;");
    expect(css).toContain("--color-bone-white: #ffffff;");
    expect(css).toContain("--font-weight-normal: 400;");
    console.info(
      `G56C4 CSS: ${checks.length} declarations plus 24px/6px spacing, focus/hover selectors and white/ink/400 tokens; no generated files.`,
    );
  });
});
