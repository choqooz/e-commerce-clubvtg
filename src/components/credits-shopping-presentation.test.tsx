import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREDIT_PACKS, formatPrice } from "@/lib/config";
import type { CreditPackId } from "@/lib/types";

// Shallow state and service boundaries only. No effects, auth, network or payments.
// Real pack cards, balance, Button, Badge and Next links are rendered in SSR.
const probe = vi.hoisted(() => ({
  loadingPack: null as CreditPackId | null,
  setLoadingPack: vi.fn(),
  push: vi.fn(),
  preference: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [probe.loadingPack, probe.setLoadingPack],
  useCallback: (callback: unknown) => callback,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: probe.push }) }));
vi.mock("sonner", () => ({ toast: { error: probe.error } }));
vi.mock("@/lib/actions/credits", () => ({ createCreditPackPreference: probe.preference }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header data-chrome="header" /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer data-chrome="footer" /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
import { CreditBalance } from "./credits/credit-balance";
import { CreditPackCard } from "./credits/credit-pack-card";
import { CreditsPageContent } from "./credits/credits-page-content";

beforeEach(() => {
  vi.clearAllMocks();
  probe.loadingPack = null;
});
const paths = [
  "src/components/credits/credits-page-content.tsx",
  "src/components/credits/credit-pack-card.tsx",
  "src/components/credits/credit-balance.tsx",
] as const;
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Captured from live pretask bytes BEFORE V5 implementation, never from HEAD or
// recomputed to accept new behavior. Only the exact new grouping is normalized.
const PRETASK_SYNTAX_DIGESTS = [
  "ec97de00df891087a5b49674df856b7f0ca9bce0d1e2acff45970457e70f41c4",
  "3f4534c7975518a329894d9d68010e467d533c5675cb5b0a44a9cf90886d3998",
  "b8e6b8c5161679a62e5a35b4006a9fe1f4e43802b088bb139a761005690773f9",
];
function originalCreditsPresentation(text: string, path: string): string {
  if (path === paths[0]) {
    text = text
      .replace(/<(\/?)header\b/g, "<$1div")
      .replace(/<(\/?)section\b/g, "<$1div")
      .replace(/\s+(?:id|aria-labelledby)="credits-(?:balance|packs|help)-heading"/g, "")
      .replace(/<h2([^>]*)>(\s*¿Cómo funcionan los créditos\?\s*)<\/h2>/, "<h3$1>$2</h3>");
  }
  if (path === paths[1]) {
    text = text
      .replace(/<(\/?)article\b/g, "<$1div")
      .replace(/<(\/?)h3\b/g, "<$1p")
      .replace(/\s+aria-labelledby=\{`credit-pack-\$\{packId\}`\}/g, "")
      .replace(/\s+id=\{`credit-pack-\$\{packId\}`\}/g, "");
  }
  return text;
}
function isRenderedText(value: unknown): value is [ts.SyntaxKind.JsxText, string] {
  return Array.isArray(value) && value[0] === ts.SyntaxKind.JsxText && typeof value[1] === "string";
}
function behavior(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression);
  if (
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
    if (value === undefined) return;
    const previous = children.at(-1);
    if (isRenderedText(previous) && isRenderedText(value)) previous[1] += value[1];
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
const digest = (text: string, path: string) =>
  createHash("sha256")
    .update(JSON.stringify(behavior(parse(originalCreditsPresentation(text, path)))))
    .digest("hex");

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const page = (initialCredits = 7) => CreditsPageContent({ initialCredits });
const cards = (tree: ReactNode) =>
  descendants(tree).filter((element) => element.type === CreditPackCard);

describe("V5 immutable pretask preservation", () => {
  it.each(paths)("retains full nonpresentation syntax in %s", (path) => {
    const actual = digest(source(path), path);
    expect(actual).toBe(PRETASK_SYNTAX_DIGESTS[paths.indexOf(path)]);
  });
  it("rejects purchase, loading, balance, money, configuration and copy mutations", () => {
    for (const [path, before, after] of [
      [paths[0], "createCreditPackPreference(packId)", 'createCreditPackPreference("pro")'],
      [paths[0], "router.push(result.url)", "router.replace(result.url)"],
      [paths[0], "setLoadingPack(null)", "setLoadingPack(packId)"],
      [paths[0], "toast.error(result.error)", 'toast.error("Other")'],
      [paths[0], "CREDIT_PACKS.map", "OTHER_PACKS.map"],
      [paths[0], "credits={initialCredits}", "credits={0}"],
      [paths[0], "loadingPack === pack.id", "loadingPack !== pack.id"],
      [paths[0], "Se descuenta 1 crédito", "Se descuenta 2 créditos"],
      [paths[1], "onSelect(packId)", 'onSelect("pro")'],
      [paths[1], "disabled={loading}", "disabled={false}"],
      [paths[1], "formatPrice(price)", "formatPrice(price * 2)"],
      [paths[1], '"Comprar"', '"Confirmar"'],
      [paths[2], "credits === 0", "credits < 1"],
      [paths[2], "{credits}</span>", "{credits + 1}</span>"],
    ]) {
      const original = source(path);
      expect(original).toContain(before);
      expect(digest(original.replace(before, after), path)).not.toBe(digest(original, path));
    }
  });
  it("accepts exact formatter spaces only and keeps guards, props and meaningful copy", () => {
    const inline = "<p>Precio: {price} · Créditos: {credits}</p>";
    const wrapped = '<p>\n Precio: {price} · Créditos:{" "}\n {credits}\n</p>';
    expect(behavior(parse(wrapped))).toEqual(behavior(parse(inline)));
    for (const [before, after] of [
      ['{" "}', ""],
      ['{" "}', '{"  "}'],
      ["{price}", "{total}"],
      ["Créditos:", "Balance:"],
    ])
      expect(behavior(parse(wrapped.replace(before, after)))).not.toEqual(behavior(parse(inline)));
    const group =
      '<section aria-labelledby="credits-packs-heading"><h2 id="credits-packs-heading">Comprá créditos</h2></section>';
    expect(behavior(parse(originalCreditsPresentation(group, paths[0])))).toEqual(
      behavior(parse("<div><h2>Comprá créditos</h2></div>")),
    );
    expect(
      originalCreditsPresentation(
        group.replace("credits-packs-heading", "other-heading"),
        paths[0],
      ),
    ).toContain("other-heading");
  });
});

describe("V5 actual credits SSR and shallow purchase callbacks (not live payment proof)", () => {
  it.each([0, 1, 7, 120])(
    "keeps the caller balance and Spanish instructions at %s credits",
    (credits) => {
      const tree = page(credits);
      const balance = descendants(tree).find((element) => element.type === CreditBalance)!;
      expect(balance.props.credits).toBe(credits);
      const markup = html(tree);
      expect(markup).toContain(`class="tabular-nums">${credits}</span>`);
      for (const copy of [
        "Inicio",
        "Créditos",
        "Tu balance",
        "Comprá créditos",
        "Cada crédito te permite generar una prueba virtual de cualquier prenda.",
        "¿Cómo funcionan los créditos?",
        "Comprá un pack de créditos con MercadoPago.",
        "Elegí una prenda de la tienda y hacé clic en &quot;Probate esta prenda&quot;.",
        "Subí una foto tuya y nuestra IA genera una prueba virtual.",
        "Se descuenta 1 crédito por cada generación.",
      ])
        expect(markup).toContain(copy);
      expect(markup).toContain('href="/"');
      expect(probe.preference).not.toHaveBeenCalled();
      expect(probe.push).not.toHaveBeenCalled();
    },
  );
  it("uses named balance, packs and instructions groups with a single editorial page heading", () => {
    const nodes = descendants(page());
    expect(nodes.filter((element) => element.type === "h1")).toHaveLength(1);
    const balance = nodes.find(
      (element) =>
        element.type === "header" && element.props["aria-labelledby"] === "credits-balance-heading",
    )!;
    expect(balance).toBeDefined();
    expect(descendants(balance).find((element) => element.type === "h1")?.props.id).toBe(
      "credits-balance-heading",
    );
    expect(balance.props.className).toContain("bg-warm-sand");
    const sections = nodes.filter((element) => element.type === "section");
    expect(sections.map((element) => element.props["aria-labelledby"])).toEqual([
      "credits-packs-heading",
      "credits-help-heading",
    ]);
    for (const section of sections)
      expect(descendants(section).find((element) => element.type === "h2")?.props.id).toBe(
        section.props["aria-labelledby"],
      );
  });
  it("aligns the left breadcrumb anchor at md while retaining the entire Credits vertical gap", () => {
    const main = descendants(page()).find((node) => node.type === "main")!;
    expect(main).toBeDefined();
    const [wrapper, content] = Children.toArray(main.props.children) as Element[];
    expect(wrapper.type).toBe("div");
    expect(wrapper.props.className).toBe("w-full px-[18px] py-[18px] md:px-[30px]");
    const nav = wrapper.props.children as Element;
    expect(nav.type).toBe("nav");
    expect(nav.props.className).toBe(
      "flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono md:mx-auto md:max-w-[1200px]",
    );
    expect(nav.props.style).toBeUndefined();
    expect(content.props.className).toBe("w-full px-[18px] pb-[42px] md:px-[30px]");
    const inner = content.props.children as Element;
    expect(inner.props.className).toBe(
      "mx-auto min-w-0 max-w-[1200px] space-y-[42px] lg:space-y-[60px]",
    );
    const markup = html(nav);
    expect(markup).toMatch(/href="\/"[^>]*>Inicio<\/a>/);
    expect(markup).toContain("min-h-[48px]");
    expect(markup).toContain("focus-visible:outline-2");
  });
  it("compares every configured pack without changing price, credits, badge or selection props", () => {
    const packNodes = cards(page());
    expect(packNodes).toHaveLength(CREDIT_PACKS.length);
    packNodes.forEach((node, index) => {
      const pack = CREDIT_PACKS[index];
      expect(node.props).toMatchObject({
        packId: pack.id,
        name: pack.name,
        credits: pack.credits,
        price: pack.price,
        popular: pack.popular,
        loading: false,
      });
      const tree = CreditPackCard(node.props as unknown as Parameters<typeof CreditPackCard>[0]);
      expect(tree.type).toBe("article");
      expect(tree.props["aria-labelledby"]).toBe(`credit-pack-${pack.id}`);
      expect(descendants(tree).find((element) => element.type === "h3")?.props.id).toBe(
        `credit-pack-${pack.id}`,
      );
      const markup = html(tree);
      expect(markup).toContain(pack.name);
      expect(markup).toContain(`${pack.credits}<span`);
      expect(markup).toContain(formatPrice(pack.price));
      expect(markup.includes("Más Popular")).toBe(pack.popular);
      expect(markup).toContain("min-h-[48px]");
    });
  });
  it.each([null, "basic", "popular", "pro"] as const)(
    "keeps per-pack pending guards for %s",
    (loadingPack) => {
      probe.loadingPack = loadingPack;
      cards(page()).forEach((node) => {
        const loading = node.props.packId === loadingPack;
        expect(node.props.loading).toBe(loading);
        const markup = html(node);
        expect(markup.includes('disabled=""')).toBe(loading);
        expect(markup.includes("Procesando…")).toBe(loading);
        expect(markup.includes("Comprar")).toBe(!loading);
        expect(markup.includes("animate-spin")).toBe(loading);
      });
    },
  );
  it.each(CREDIT_PACKS)("retains local selection and successful redirect for $id", async (pack) => {
    probe.preference.mockResolvedValueOnce({ url: "https://example.test/checkout" });
    const card = cards(page()).find((node) => node.props.packId === pack.id)!;
    const cardTree = CreditPackCard(card.props as unknown as Parameters<typeof CreditPackCard>[0]);
    const button = descendants(cardTree).find((node) => typeof node.props.onClick === "function")!;
    expect(button.props.disabled).toBe(false);
    await (button.props.onClick as () => Promise<void>)();
    expect(probe.preference).toHaveBeenCalledExactlyOnceWith(pack.id);
    expect(probe.setLoadingPack.mock.calls).toEqual([[pack.id], [null]]);
    expect(probe.push).toHaveBeenCalledExactlyOnceWith("https://example.test/checkout");
    expect(probe.error).not.toHaveBeenCalled();
  });
  it.each(["returned", "thrown"])(
    "keeps %s error fallback and finally clears loading",
    async (kind) => {
      if (kind === "returned") probe.preference.mockResolvedValueOnce({ error: "No disponible" });
      else probe.preference.mockRejectedValueOnce(new Error("fixture-only failure"));
      const select = cards(page())[0].props.onSelect as (id: CreditPackId) => Promise<void>;
      await select("basic");
      expect(probe.error).toHaveBeenCalledExactlyOnceWith(
        kind === "returned"
          ? "No disponible"
          : "Error al crear la preferencia de pago. Intentá de nuevo.",
      );
      expect(probe.push).not.toHaveBeenCalled();
      expect(probe.setLoadingPack.mock.calls).toEqual([["basic"], [null]]);
    },
  );
  it("keeps pending state until the mocked preference resolves", async () => {
    let resolve!: (result: { url: string }) => void;
    probe.preference.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = (cards(page())[1].props.onSelect as (id: CreditPackId) => Promise<void>)(
      "popular",
    );
    expect(probe.setLoadingPack.mock.calls).toEqual([["popular"]]);
    expect(probe.push).not.toHaveBeenCalled();
    resolve({ url: "https://example.test/resolved" });
    await pending;
    expect(probe.setLoadingPack.mock.calls).toEqual([["popular"], [null]]);
  });
  it("keeps long names and large amounts readable without fixed card heights or truncation", () => {
    const markup = html(
      <CreditPackCard
        packId="pro"
        name="Pack con un nombre muy largo para comparar sin truncamiento"
        credits={12000}
        price={123456789}
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("Pack con un nombre muy largo para comparar sin truncamiento");
    expect(markup).toContain("12000<span");
    expect(markup).toContain(formatPrice(123456789));
    expect(markup).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(markup).toContain("break-words");
    expect(markup).toContain("h-auto");
  });
});

function classCandidates(text: string): string[] {
  const classes: string[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      classes.push(...node.text.split(/\s+/).filter(Boolean));
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className")
      collect(node);
    else ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return classes;
}
describe("V5 installed-theme presentation", () => {
  it("compiles actual responsive comparison, type, spacing and comfortable actions in memory", async () => {
    const classes = new Set(paths.flatMap((path) => classCandidates(source(path))));
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|rounded-(?!none)|font-(bold|semibold|medium|light)|(?:bg|text|border)-(?:amber|green|red|blue)-/,
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    const utility = (name: string): string => {
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
      ["h-auto", "height", "auto"],
      ["p-[24px]", "padding", "24px"],
      ["md:p-[36px]", "padding", "36px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["py-[12px]", "padding-block", "12px"],
      ["gap-[24px]", "gap", "24px"],
      ["md:gap-[30px]", "gap", "30px"],
      ["max-w-[1200px]", "max-width", "1200px"],
      ["flex", "display", "flex"],
      ["md:mx-auto", "margin-inline", "auto"],
      ["md:max-w-[1200px]", "max-width", "1200px"],
      ["py-[18px]", "padding-block", "18px"],
      ["text-[60px]", "font-size", "60px"],
      ["leading-[1.5]", "line-height", "1.5"],
      ["md:grid-cols-3", "grid-template-columns", "repeat(3, minmax(0, 1fr))"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["focus-visible:outline-2", "outline-width", "2px"],
    ])
      expect(utility(name)).toContain(`${property}: ${value};`);
    expect(utility("md:grid-cols-3")).toContain("@media (width >= 48rem)");
    expect(utility("md:p-[36px]")).toContain("@media (width >= 48rem)");
    expect(utility("md:mx-auto")).toContain("@media (width >= 48rem)");
    expect(utility("md:max-w-[1200px]")).toContain("@media (width >= 48rem)");
    expect(utility("flex")).not.toContain("@media");
    expect(utility("py-[18px]")).not.toContain("@media");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
  });
});
