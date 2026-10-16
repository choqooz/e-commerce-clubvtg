import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

const BASELINE = "910245e38b113341deaa4ae325b0c40b713c2013";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const parse = (source: string) =>
  ts.createSourceFile("chrome.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (node: ts.Node, visit: (node: ts.Node) => void) => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};
const semantic = (node: ts.Node): unknown => {
  // App-owned utility strings may change; Clerk's nested appearance object may not.
  if (ts.isJsxAttribute(node) && node.name.getText() === "className") return null;
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => children.push(semantic(child)));
  return [
    node.kind,
    ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      ? node.text
      : null,
    ts.isJsxText(node) ? node.text.trim() : null,
    children,
  ];
};
const businessContracts = (source: string) => {
  const clerk: unknown[] = [];
  walk(parse(source), (node) => {
    // M12 moves balance ownership to the header; callback regressions guard its new lifecycle.
    if (
      ts.isJsxElement(node) &&
      ["UserButton", "SignInButton"].includes(node.openingElement.tagName.getText())
    )
      clerk.push(semantic(node));
  });
  return { clerk };
};

describe("Shared storefront chrome", () => {
  it("preserves desktop Clerk appearance, modal and complete managed menu against the fixed baseline", () => {
    const baseline = execFileSync("git", ["show", `${BASELINE}:src/components/site-header.tsx`], {
      encoding: "utf8",
    });
    expect(businessContracts(read("site-header.tsx"))).toEqual(businessContracts(baseline));
  });

  it("replaces the compact sand footer with four truthful editorial stories and retained information links", () => {
    const markup = renderToStaticMarkup(<SiteFooter />);
    expect(markup.match(/<section /g)).toHaveLength(4);
    expect(markup.match(/<h2 /g)).toHaveLength(4);
    for (let index = 0; index < 4; index++) {
      expect(markup).toContain(`aria-labelledby="footer-story-${index}"`);
      expect(markup).toContain(`id="footer-story-${index}"`);
    }
    for (const copy of [
      "Vintage",
      "curado",
      "Piezas",
      "únicas",
      "Envíos",
      "nacionales",
      "Probador",
      "con IA",
      "Cada pieza tiene una historia.",
    ])
      expect(markup).toContain(copy);
    for (const href of ["/", "/#catalog", "/credits", "mailto:choqooz@gmail.com"])
      expect(markup).toContain(`href="${href}"`);
    expect(markup).toContain("Todos los derechos reservados.");
    expect(markup).not.toMatch(/Glein|Wien|Europa|sostenib|premio|border-t|bg-warm-sand|<h1/);
  });

  it("compiles retained header areas, M6 upper tracks and M9 centered lower columns", async () => {
    const classes: string[] = [];
    for (const path of ["site-header.tsx", "site-footer.tsx"]) {
      const source = read(path);
      expect(source).not.toMatch(/min-h-\[(?:7\d\d|10\d\d|11\d\d)px\]/);
      walk(parse(source), (node) => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        )
          classes.push(...node.text.split(/\s+/));
      });
    }
    const globals = read("../app/globals.css");
    const compiler = await compile(
      `${read("../../node_modules/tailwindcss/theme.css")}\n${(globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? []).join("\n")}\n@tailwind utilities;`,
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
      throw new Error(`Unbalanced utility: ${name}`);
    };
    for (const [name, declaration] of [
      ["h-[20px]", "height: 20px;"],
      ["md:h-[26px]", "height: 26px;"],
      ["h-[50px]", "height: 50px;"],
      ["md:h-[80px]", "height: 80px;"],
      ["h-[44px]", "height: 44px;"],
      ["w-[44px]", "width: 44px;"],
      ["grid-cols-[1fr_auto_1fr]", "grid-template-columns: 1fr auto 1fr;"],
      ["w-[min(360px,100vw)]", "width: min(360px, 100vw);"],
      ["overflow-y-auto", "overflow-y: auto;"],
      ["md:hidden", "display: none;"],
      ["md:grid-cols-[3fr_2fr_3fr]", "grid-template-columns: 3fr 2fr 3fr;"],
      ["grid-cols-2", "grid-template-columns: repeat(2, minmax(0, 1fr));"],
      ["md:grid-cols-4", "grid-template-columns: repeat(4, minmax(0, 1fr));"],
      ["grid-cols-[1fr_3fr]", "grid-template-columns: 1fr 3fr;"],
      ["md:grid-cols-16", "grid-template-columns: repeat(16, minmax(0, 1fr));"],
      ["col-start-2", "grid-column-start: 2;"],
      ["md:col-span-8", "grid-column: span 8 / span 8;"],
      ["md:col-span-3", "grid-column: span 3 / span 3;"],
      ["md:col-start-9", "grid-column-start: 9;"],
      ["md:col-start-12", "grid-column-start: 12;"],
      ["row-span-4", "grid-row: span 4 / span 4;"],
      ["md:row-span-2", "grid-row: span 2 / span 2;"],
      ["text-left", "text-align: left;"],
      ["px-[14px]", "padding-inline: 14px;"],
      ["md:px-0", "padding-inline: calc(var(--spacing) * 0);"],
      ["gap-x-[8px]", "column-gap: 8px;"],
      ["pl-[11px]", "padding-left: 11px;"],
      ["pr-[22px]", "padding-right: 22px;"],
      ["md:pl-[13px]", "padding-left: 13px;"],
      ["md:pr-[26px]", "padding-right: 26px;"],
      ["md:pt-[64px]", "padding-top: 64px;"],
      ["md:mb-[12.8px]", "margin-bottom: 12.8px;"],
      ["leading-[33px]", "line-height: 33px;"],
      ["max-w-[1280px]", "max-width: 1280px;"],
      ["max-w-[240px]", "max-width: 240px;"],
      ["mx-auto", "margin-inline: auto;"],
      ["text-center", "text-align: center;"],
      ["items-center", "align-items: center;"],
      ["items-start", "align-items: flex-start;"],
      ["gap-x-[18px]", "column-gap: 18px;"],
      ["md:gap-x-[32px]", "column-gap: 32px;"],
      ["px-[18px]", "padding-inline: 18px;"],
      ["md:px-[32px]", "padding-inline: 32px;"],
      ["px-[6px]", "padding-inline: 6px;"],
      ["py-[8px]", "padding-block: 8px;"],
      ["pt-[8px]", "padding-top: 8px;"],
      ["gap-y-[30.8px]", "row-gap: 30.8px;"],
      ["md:gap-y-[36.4px]", "row-gap: 36.4px;"],
      ["pt-[77px]", "padding-top: 77px;"],
      ["md:pt-[91px]", "padding-top: 91px;"],
      ["mt-[77px]", "margin-top: 77px;"],
      ["md:mt-[91px]", "margin-top: 91px;"],
      ["text-[20px]", "font-size: 20px;"],

      ["md:text-[111px]", "font-size: 111px;"],
      ["text-[11px]", "font-size: 11px;"],
      ["leading-[15px]", "line-height: 15px;"],
      ["md:leading-[15.5px]", "line-height: 15.5px;"],
      ["bg-white", "background-color: var(--color-white);"],
      ["whitespace-nowrap", "white-space: nowrap;"],
      ["truncate", "text-overflow: ellipsis;"],
      ["sticky", "position: sticky;"],
      ["focus-visible:outline-2", "outline-width: 2px;"],
    ])
      expect(utility(name), name).toContain(declaration);
    for (const name of [
      "md:hidden",
      "md:h-[80px]",
      "md:grid-cols-16",
      "md:col-start-9",
      "md:col-start-12",
    ])
      expect(utility(name)).toContain("@media (width >= 48rem)");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
  });

  it("compiles the actual scoped loop, phase-preserving pause and static reduced-motion notice", async () => {
    const compiler = await compile(read("storefront-announcement.module.css"));
    const css = compiler.build([]);
    const mediaStart = css.indexOf("@media");
    const declarations = (selector: string, reduced = false) => {
      const section = reduced ? css.slice(mediaStart) : css.slice(0, mediaStart);
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
      const body = section.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
      expect(body, selector).toBeDefined();
      return Object.fromEntries(
        [...body!.matchAll(/([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
      );
    };
    expect(declarations(".track")).toMatchObject({
      display: "flex",
      width: "max-content",
      animation: "shipping-loop 60s linear infinite",
    });
    expect(declarations(".group")).toMatchObject({
      display: "flex",
      flex: "none",
      "min-width": "100vw",
      gap: "64px",
      "padding-inline": "32px",
    });
    expect(declarations(".viewport")).toMatchObject({
      flex: "1",
      "min-width": "0",
      overflow: "hidden",
    });
    expect(declarations(".bar:hover .track,\n.bar:focus-within .track")).toEqual({
      "animation-play-state": "paused",
    });
    expect(declarations(".track")["animation-play-state"]).toBeUndefined();
    expect(css).not.toMatch(/\.toggle|data-paused/);
    expect(css.match(/@keyframes shipping-loop/g)).toHaveLength(1);
    expect(declarations("to")).toEqual({ transform: "translateX(-50%)" });
    expect(css.match(/@media[^\{]+/g)?.map((value) => value.trim())).toEqual([
      "@media (prefers-reduced-motion: reduce)",
    ]);
    expect(declarations(".track", true)).toEqual({ animation: "none", transform: "none" });
    expect(declarations(".viewport", true)).toEqual({ display: "none" });
    expect(declarations(".notice", true)).toMatchObject({
      position: "static",
      width: "auto",
      height: "auto",
      overflow: "visible",
      "clip-path": "none",
      "margin-inline": "auto",
    });
    expect(read("storefront-announcement.module.css")).not.toMatch(/:global|\b(?:body|html)\b/);
  });
});
