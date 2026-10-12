import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatPrice } from "@/lib/config";

// Only CouponSelection's cart and server action boundary is mocked. CreditPackCard
// and the shared Button/Badge render normally; no effects or real actions run.
const probe = vi.hoisted(() => ({
  cart: {
    couponCode: "",
    couponSource: null,
    items: [] as { product: { id: string } }[],
    clearCouponSelection: vi.fn(),
    getCouponQuoteVersion: vi.fn(),
    isCouponQuoteVersionCurrent: vi.fn(),
    selectCoupon: vi.fn(),
    setCouponCode: vi.fn(),
  },
}));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => probe.cart }));
vi.mock("@/lib/actions/coupon-quote", () => ({ quoteCouponCheckout: vi.fn() }));
import { quoteCouponCheckout } from "@/lib/actions/coupon-quote";
import { CreditPackCard } from "./credits/credit-pack-card";
import { CouponSelection } from "./coupon-selection";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(probe.cart, { couponCode: "", couponSource: null, items: [] });
});

// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "src/app/(shop)/checkout/page.tsx",
  "src/app/(shop)/checkout/success/page.tsx",
  "src/app/(shop)/checkout/failure/page.tsx",
  "src/app/(shop)/checkout/pending/page.tsx",
  "src/components/checkout-form.tsx",
  "src/components/coupon-selection.tsx",
  "src/components/payment-reconciliation-handoff.tsx",
  "src/components/profile/profile-page-content.tsx",
  "src/components/credits/credits-page-content.tsx",
  "src/components/credits/credit-pack-card.tsx",
  "src/components/orders/orders-page-content.tsx",
];
// Retain all profile, credits, pack and order baseline guards until their own units.
const checkoutPaths = new Set(paths.slice(0, 7));
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Restore only the accepted checkout groups and exact field/error associations.
// No later profile, credits, pack or order presentation is normalized here.
function originalCheckoutPresentation(text: string, path: string): string {
  if (path === "src/components/checkout-form.tsx") {
    text = text.replace(/<(\/?)fieldset\b/g, "<$1div").replace(/<(\/?)legend\b/g, "<$1h3");
    for (const field of [
      "fullName",
      "email",
      "dni",
      "phone",
      "street",
      "number",
      "floorOrApt",
      "city",
      "province",
      "zipCode",
    ]) {
      for (const attribute of [
        `id="checkout-${field}"`,
        `htmlFor="checkout-${field}"`,
        `id="checkout-${field}-error"`,
        `aria-invalid={Boolean(form.formState.errors.${field})}`,
      ])
        text = text.replace(attribute, "");
      text = text.replace(
        new RegExp(
          `aria-describedby=\\{\\s*form\\.formState\\.errors\\.${field}\\s*\\?\\s*"checkout-${field}-error"\\s*:\\s*undefined\\s*\\}`,
        ),
        "",
      );
    }
    text = text.replaceAll('aria-live="polite"', "").replace("aria-busy={isSubmitting}", "");
  }
  if (path === "src/app/(shop)/checkout/page.tsx") {
    text = text
      .replace(/<(\/?)aside\b/g, "<$1div")
      .replace('aria-labelledby="checkout-summary-heading"', "")
      .replace('id="checkout-summary-heading"', "")
      .replace('sizes="(min-width: 1280px) 104px, 88px"', 'sizes="64px"');
  }
  return text;
}

function isRenderedText(value: unknown): value is [ts.SyntaxKind.JsxText, string] {
  return Array.isArray(value) && value[0] === ts.SyntaxKind.JsxText && typeof value[1] === "string";
}

// Preservation evidence, not interaction coverage: compare the entire syntax tree,
// excluding only className, JSX formatting whitespace and redundant parentheses.
// The parser already normalizes trailing commas; handlers, guards and money remain.
function behavior(node: ts.Node, normalizeCheckoutSpaces = false): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression, normalizeCheckoutSpaces);
  // Checkout's wrapped explicit space is equivalent to inline rendered text.
  // Leave the unrelated baseline normalizer unchanged, including meaningful spaces.
  if (
    normalizeCheckoutSpaces &&
    ts.isJsxExpression(node) &&
    node.expression &&
    ts.isStringLiteral(node.expression) &&
    node.expression.text === " " &&
    (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
  )
    return [ts.SyntaxKind.JsxText, " "];
  if (
    (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
    node.name.text === "className"
  )
    return undefined;
  if (ts.isJsxText(node)) {
    // Match JSX's line-edge formatting rules, preserving meaningful inline spaces.
    const lines = node.text.split(/\r\n|\n|\r/);
    const lastContentLine = Math.max(
      0,
      lines.findLastIndex((line) => /[^ \t]/.test(line)),
    );
    const text = lines
      .map((line, index) => {
        let content = line.replace(/\t/g, " ");
        if (index !== 0) content = content.replace(/^ +/, "");
        if (index !== lines.length - 1) content = content.replace(/ +$/, "");
        return content && index !== lastContentLine ? `${content} ` : content;
      })
      .join("");
    return text ? [node.kind, text] : undefined;
  }
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    const value = behavior(child, normalizeCheckoutSpaces);
    if (value === undefined) return;
    const previous = children.at(-1);
    if (normalizeCheckoutSpaces && isRenderedText(previous) && isRenderedText(value))
      previous[1] += value[1];
    else children.push(value);
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

describe("Bounded actual component SSR (not browser interaction coverage)", () => {
  it.each([
    { popular: false, loading: false },
    { popular: true, loading: false },
    { popular: true, loading: true },
  ])("keeps credit pack price/copy and loading semantics for %j", ({ popular, loading }) => {
    const onSelect = vi.fn();
    const markup = renderToStaticMarkup(
      <CreditPackCard
        packId="popular"
        name="Pack Popular"
        credits={20}
        price={12000}
        popular={popular}
        loading={loading}
        onSelect={onSelect}
      />,
    );
    expect(markup).toContain("Pack Popular");
    expect(markup).toContain("20<span");
    expect(markup).toContain("créditos");
    expect(markup).toContain(formatPrice(12000));
    expect(markup.includes("Más Popular")).toBe(popular);
    expect(markup.includes("Procesando…")).toBe(loading);
    expect(markup.includes("Comprar")).toBe(!loading);
    expect(markup.includes('disabled=""')).toBe(loading);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    { code: "", hasItem: true, disabled: true },
    { code: "   ", hasItem: true, disabled: true },
    { code: "AHORRO20", hasItem: false, disabled: true },
    { code: "AHORRO20", hasItem: true, disabled: false },
  ])(
    "keeps coupon initial SSR guard for %j without quoting or reserving",
    ({ code, hasItem, disabled }) => {
      probe.cart.couponCode = code;
      probe.cart.items = hasItem ? [{ product: { id: "fixture-garment" } }] : [];
      const markup = renderToStaticMarkup(<CouponSelection />);
      expect(markup).toContain('aria-labelledby="coupon-selection-heading"');
      expect(markup).toContain('for="coupon-code"');
      expect(markup).toContain('id="coupon-code"');
      expect(markup).toContain(`value="${code}"`);
      expect(markup).toContain("Promociones y cupón");
      expect(markup).toContain("Cotizá un cupón sin reservarlo.");
      expect(markup.includes("Quitar")).toBe(Boolean(code));
      const quoteButton = markup.match(/<button\b[^>]*>Cotizar<\/button>/)?.[0];
      expect(quoteButton).toBeDefined();
      expect(quoteButton!.includes('disabled=""')).toBe(disabled);
      expect(markup).not.toContain("<fieldset");
      expect(quoteCouponCheckout).not.toHaveBeenCalled();
      expect(probe.cart.selectCoupon).not.toHaveBeenCalled();
      expect(probe.cart.clearCouponSelection).not.toHaveBeenCalled();
    },
  );
});

describe("G56B checkout/account behavior preservation", () => {
  it.each(paths)(
    "preserves all nonpresentation syntax in %s relative to the original pre-redesign baseline",
    (path) => {
      const baseline = execFileSync("git", ["show", `${ORIGINAL_PRE_REDESIGN_COMMIT}:${path}`], {
        encoding: "utf8",
      });
      if (checkoutPaths.has(path))
        expect(behavior(parse(originalCheckoutPresentation(source(path), path)), true)).toEqual(
          behavior(parse(baseline), true),
        );
      else expect(behavior(parse(source(path)))).toEqual(behavior(parse(baseline)));
    },
  );

  it("normalizes only allowed className and formatting differences", () => {
    const baseline =
      'const options = { className: "old", enabled: true }; const view = <p className="old">Texto original</p>; const amount = pay(100);';
    const formatted =
      'const options = { className: "new", enabled: true, }; const view = (<p className="new">\n  Texto original\n</p>); const amount = (pay(100,));';
    expect(behavior(parse(formatted))).toEqual(behavior(parse(baseline)));
    expect(behavior(parse(baseline.replace("enabled: true", "enabled: false")))).not.toEqual(
      behavior(parse(baseline)),
    );
  });

  it("normalizes wrapped checkout error associations without hiding a different expression or business prop", () => {
    const path = "src/components/checkout-form.tsx";
    const singleLine =
      '<input aria-describedby={form.formState.errors.fullName ? "checkout-fullName-error" : undefined} disabled={isSubmitting} />';
    const wrapped =
      '<input aria-describedby={\n form.formState.errors.fullName ? "checkout-fullName-error" : undefined\n} disabled={isSubmitting} />';
    const signature = (text: string) =>
      behavior(parse(originalCheckoutPresentation(text, path)), true);
    expect(signature(wrapped)).toEqual(signature(singleLine));
    for (const [before, after] of [
      ["errors.fullName", "errors.email"],
      ["checkout-fullName-error", "checkout-email-error"],
      ["undefined", '"other-description"'],
      ["disabled={isSubmitting}", "disabled={false}"],
    ])
      expect(signature(wrapped.replace(before, after))).not.toEqual(signature(singleLine));
  });

  it("normalizes explicit checkout JSX spaces while preserving copy, expressions and meaningful spacing", () => {
    const inline = "<span>Descuento: {amount} · Total con envío: {total}</span>";
    const wrapped = '<span>\n Descuento: {amount} · Total con envío:{" "}\n {total}\n</span>';
    const signature = (text: string) => behavior(parse(text), true);
    expect(signature(wrapped)).toEqual(signature(inline));
    for (const [before, after] of [
      ['{" "}', ""],
      ['{" "}', '{"  "}'],
      ["Descuento:", "Precio:"],
      ["{total}", "{subtotal}"],
    ])
      expect(signature(wrapped.replace(before, after))).not.toEqual(signature(inline));
    expect(signature('<p>A{" "}B</p>')).toEqual(signature("<p>A B</p>"));
    expect(signature('<p>A{" "}{" "}B</p>')).not.toEqual(signature("<p>A B</p>"));
    // The profile/credits/orders comparison still uses the exact original normalizer.
    expect(behavior(parse(wrapped))).not.toEqual(behavior(parse(inline)));
    for (const path of paths.filter((path) => !checkoutPaths.has(path)))
      expect(originalCheckoutPresentation(source(path), path)).toBe(source(path));
  });

  it("does not normalize away handlers, guards, copy, links, money or nonclass props", () => {
    const original =
      'const card = <button className="old" disabled={busy} onClick={() => pay(100)}><a href="/orders">Pagar</a></button>;';
    expect(behavior(parse(original))).toEqual(
      behavior(parse(original.replace('className="old"', 'className="new"'))),
    );
    for (const [before, after] of [
      ["busy", "ready"],
      ["pay(100)", "cancel(100)"],
      ["100", "101"],
      ["/orders", "/credits"],
      ["Pagar", "Cancelar"],
      ["Pagar", " Pagar "],
      ["disabled", "hidden"],
    ])
      expect(behavior(parse(original.replace(before, after)))).not.toEqual(
        behavior(parse(original)),
      );
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
    if (
      (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "className"
    )
      collect(node);
    else ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return candidates;
}

describe("Actual source classes compiled with the installed Tailwind theme", () => {
  it("keeps explicit pixel fields/padding, responsive layouts, focus and neutral square surfaces", async () => {
    const classes = new Set<string>();
    for (const path of paths) {
      const candidates = classCandidates(source(path));
      expect(candidates.length, path).toBeGreaterThan(0);
      candidates.forEach((candidate) => classes.add(candidate));
    }
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|hover:scale|rounded-(?!none)|font-(bold|semibold|medium|light)|(?:bg|text|border)-(?:amber|green|red|blue)-/,
    );
    const globals = source("src/app/globals.css");
    const themes = globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    const utility = (name: string): string => {
      expect(classes.has(name), `Actual source candidate: ${name}`).toBe(true);
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
    const checks = [
      // Only checkout-exclusive field/image/action values change in this prefix.
      ["h-[48px]", "height", "48px"],
      ["min-h-[48px]", "min-height", "48px"],
      ["min-h-[36px]", "min-height", "36px"],
      ["w-[88px]", "width", "88px"],
      ["h-[110px]", "height", "110px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[12px]", "padding-block", "12px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["md:px-[30px]", "padding-inline", "30px"],
      ["p-[13px]", "padding", "13px"],
      ["md:p-[24px]", "padding", "24px"],
      ["p-[24px]", "padding", "24px"],
      ["xl:p-[36px]", "padding", "36px"],
      ["pb-[42px]", "padding-bottom", "42px"],
      ["gap-[18px]", "gap", "18px"],
      ["gap-[42px]", "gap", "42px"],
      ["lg:top-[156px]", "top", "156px"],
      ["max-w-[672px]", "max-width", "672px"],
      ["max-w-[768px]", "max-width", "768px"],
      ["max-w-[896px]", "max-width", "896px"],
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["w-full", "width", "100%"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["bg-midnight-ink", "background-color", "var(--color-midnight-ink)"],
      ["text-bone-white", "color", "var(--color-bone-white)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[16px]", "font-size", "16px"],
      ["sm:text-[60px]", "font-size", "60px"],
      ["sm:flex-row", "flex-direction", "row"],
      ["md:grid-cols-3", "grid-template-columns", "repeat(3, minmax(0, 1fr))"],
      ["md:grid-cols-4", "grid-template-columns", "repeat(4, minmax(0, 1fr))"],
      ["lg:grid-cols-12", "grid-template-columns", "repeat(12, minmax(0, 1fr))"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), `${name}: ${property}`).toContain(`${property}: ${value};`);
    const responsive = [
      ["sm:flex-row", "40rem"],
      ["md:px-[30px]", "48rem"],
      ["sm:text-[60px]", "40rem"],
      ["xl:p-[36px]", "80rem"],
      ["md:grid-cols-3", "48rem"],
      ["md:grid-cols-4", "48rem"],
      ["lg:grid-cols-12", "64rem"],
    ];
    for (const [name, width] of responsive)
      expect(utility(name)).toContain(`@media (width >= ${width})`);
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    for (const [token, value] of [
      ["midnight-ink", "#000000"],
      ["bone-white", "#ffffff"],
      ["warm-sand", "#ebe6dc"],
    ])
      expect(css).toContain(`--color-${token}: ${value};`);
    console.info(
      `G56B CSS: ${classes.size} source candidates; ${checks.length} declarations, ${responsive.length} media, 1 focus selector, 3 neutral tokens verified.`,
    );
  });
});
