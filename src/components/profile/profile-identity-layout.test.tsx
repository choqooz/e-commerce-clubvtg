import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePageContent } from "./profile-page-content";

// Shallow trees and SSR/CSS only: no mounted layout, AT, live Clerk or network proof.
const probe = vi.hoisted(() => ({ openUserProfile: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => probe }));
vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className: string;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/try-on/try-on-history", () => ({ TryOnHistory: () => null }));
beforeEach(() => vi.clearAllMocks());

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const user = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "buyer@example.test",
  imageUrl: "/identity.jpg",
  emailVerified: true,
};
function identity(overrides: Partial<typeof user> = {}) {
  const tree = ProfilePageContent({
    user: { ...user, ...overrides },
    credits: 1,
    tryOnHistory: [],
  });
  return descendants(tree).find((element) => element.type === "header")!;
}
const tokens = (element: Element) => element.props.className!.split(/\s+/);

describe("R1 circular two-column profile identity and account intro", () => {
  it.each(["base (including 320px)", "lg desktop"])("keeps exactly two columns at %s", () => {
    const header = identity();
    expect(tokens(header).filter((token) => /(?:^|:)grid-cols-/.test(token))).toEqual([
      "grid-cols-[96px_minmax(0,1fr)]",
    ]);
    expect(tokens(header)).toContain("min-w-0");
    const [avatar, info, action] = Children.toArray(header.props.children) as Element[];
    expect(Children.count(header.props.children)).toBe(3);
    expect(avatar.props).toMatchObject({
      src: user.imageUrl,
      alt: "Ada Lovelace",
      width: 96,
      height: 96,
    });
    expect(tokens(avatar)).toEqual([
      "size-[96px]",
      "rounded-full",
      "object-cover",
      "row-span-1",
      "md:row-span-2",
    ]);
    expect(info.type).toBe("div");
    expect(tokens(info)).toEqual(expect.arrayContaining(["min-w-0", "max-w-full"]));
    expect(tokens(action)).toEqual(
      expect.arrayContaining([
        "col-span-2",
        "col-start-1",
        "row-start-2",
        "md:col-span-1",
        "md:col-start-2",
      ]),
    );
  });

  it("centers a fit-width action BELOW both identity columns until md, then starts column 2", () => {
    const header = identity();
    const [avatar, info, action] = Children.toArray(header.props.children) as Element[];
    // The avatar occupies row 1 only on mobile; row 2 spans BOTH columns.
    expect(tokens(header).filter((token) => /(?:^|:)grid-cols-/.test(token))).toEqual([
      "grid-cols-[96px_minmax(0,1fr)]",
    ]);
    expect(tokens(header)).not.toContain("justify-items-center");
    expect(tokens(avatar)).toContain("row-span-1");
    expect(tokens(avatar)).toContain("md:row-span-2");
    expect(info.type).toBe("div");
    expect(
      tokens(action).filter((token) => /(?:^|:)(?:col|row)-(?:start|span)-/.test(token)),
    ).toEqual(["col-span-2", "col-start-1", "row-start-2", "md:col-span-1", "md:col-start-2"]);
    const markup = renderToStaticMarkup(action);
    const rendered = markup.match(/<button\b[^>]*class="([^"]*)"/)![1].split(/\s+/);
    expect(rendered.filter((token) => /(?:^|:)justify-self-/.test(token))).toEqual([
      "justify-self-center",
      "md:justify-self-start",
    ]);
    // No sm override: the mobile alignment must also survive the 640–767px range.
    expect(rendered.filter((token) => /(?:^|:)w-/.test(token))).toEqual(["w-fit"]);
    expect(rendered).toEqual(
      expect.arrayContaining([
        "col-span-2",
        "col-start-1",
        "row-start-2",
        "md:col-span-1",
        "md:col-start-2",
        "min-w-0",
        "max-w-full",
        "h-auto",
        "min-h-[48px]",
        "whitespace-normal",
        "break-words",
      ]),
    );
    expect(rendered).not.toContain("mx-auto");
    expect(markup).toContain("Gestionar cuenta");
  });

  it("keeps one account H1, no visible mobile intro bulk, and a compact desktop identity gap", () => {
    const tree = ProfilePageContent({ user, credits: 1, tryOnHistory: [] });
    const nodes = descendants(tree);
    const headings = nodes.filter((node) => node.type === "h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].props.children).toBe("Mi cuenta");
    const intro = nodes.find(
      (node) => node.type === "div" && node.props.className?.split(/\s+/).includes("sr-only"),
    )!;
    expect(tokens(intro)).toEqual(
      expect.arrayContaining(["sr-only", "md:not-sr-only", "md:mb-[18px]"]),
    );
    expect(renderToStaticMarkup(intro)).toContain("Gestioná tus datos, pedidos y créditos");
    const header = identity();
    expect(tokens(header)).toContain("md:pt-0");
    expect(tokens(header)).not.toContain("lg:py-[42px]");
    const name = descendants(header).find((node) => node.type === "h2")!;
    expect(name.props.children).toBe("Ada Lovelace");
    expect(nodes.filter((node) => /^h[3-6]$/.test(String(node.type)))).toHaveLength(0);
  });

  it.each([
    { firstName: "Alexandra Maria ".repeat(12), lastName: "de la Vega ".repeat(8) },
    { firstName: "A".repeat(120), lastName: "B".repeat(120) },
  ])("protects 320px long spaced/unbroken name/email fixtures (SSR/CSS only)", (names) => {
    const email = `${"long-address".repeat(20)}@example.test`;
    const header = identity({ ...names, email });
    const [avatar, info, action] = Children.toArray(header.props.children) as Element[];
    expect(tokens(avatar)).toContain("row-span-1");
    expect(tokens(info)).toContain("min-w-0");
    expect(tokens(action)).toEqual(
      expect.arrayContaining(["col-span-2", "col-start-1", "row-start-2", "justify-self-center"]),
    );
    const nodes = descendants(header);
    const heading = nodes.find((element) => element.type === "h2")!;
    const address = nodes.find((element) => element.type === "p")!;
    expect(tokens(heading)).toEqual(
      expect.arrayContaining(["break-words", "text-[30px]", "leading-[1.2]"]),
    );
    expect(tokens(address)).toEqual(
      expect.arrayContaining(["break-all", "text-[15px]", "leading-[1.5]"]),
    );
    const markup = renderToStaticMarkup(header);
    expect(markup).toContain(`${names.firstName} ${names.lastName}`);
    expect(markup).toContain(email);
    expect(markup).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    const badge = markup.match(/<span[^>]*data-slot="badge"[^>]*>/)![0];
    expect(badge).toContain("max-w-full");
    expect(badge).toContain("whitespace-normal");
  });

  it("renders a wrapping, focusable action and retains the exact Clerk callback", () => {
    const header = identity();
    const action = descendants(header).find(
      (element) => typeof element.props.onClick === "function",
    )!;
    const markup = renderToStaticMarkup(action);
    const button = markup.match(/<button\b[^>]*>/)![0];
    for (const utility of [
      "h-auto",
      "min-h-[48px]",
      "min-w-0",
      "max-w-full",
      "whitespace-normal",
      "break-words",
      "focus-visible:outline-2",
    ])
      expect(button).toContain(utility);
    expect(button).not.toMatch(/whitespace-nowrap|h-\[28px\]/);
    expect(button).not.toMatch(/\s(?:disabled|hidden)(?:\s|=|>)|\stabindex="-1"/);
    expect(markup).toContain("Gestionar cuenta");
    expect(probe.openUserProfile).not.toHaveBeenCalled();
    (action.props.onClick as () => void)();
    expect(probe.openUserProfile).toHaveBeenCalledExactlyOnceWith();
    // The inherited account suite separately covers all name fallbacks, badge states,
    // credits/history/chrome and immutable business/AST mutation sentinels.
  });

  it("matches the compact Orders breadcrumb gap without changing identity bottom or content geometry", () => {
    const main = descendants(ProfilePageContent({ user, credits: 1, tryOnHistory: [] })).find(
      (node) => node.type === "main",
    )!;
    expect(main).toBeDefined();
    const [wrapper, content] = Children.toArray(main.props.children) as Element[];
    expect(wrapper.type).toBe("div");
    expect(wrapper.props.className).toBe(
      "w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]",
    );
    const nav = wrapper.props.children as Element;
    expect(nav.type).toBe("nav");
    expect(nav.props.className).toBe(
      "flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono md:mx-auto md:max-w-[1200px]",
    );
    expect(content.props.className).toBe("w-full px-[18px] pb-[42px] md:px-[30px]");
    const header = descendants(content).find((node) => node.type === "header")!;
    expect(tokens(header).filter((token) => /(?:^|:)(?:p|py|pt|pb)-/.test(token))).toEqual([
      "pt-0",
      "pb-[24px]",
      "md:pt-0",
      "lg:pb-[42px]",
    ]);
    // Block-level flex nav has auto width in a block wrapper, not fit-content or
    // centered text. Only md margins/max-width align its left anchor with content.
    expect(nav.props.style).toBeUndefined();
    expect(renderToStaticMarkup(nav)).toMatch(/href="\/"[^>]*>Inicio<\/a>/);
  });

  it("compiles actual rendered identity utilities using the installed Tailwind/theme", async () => {
    const markup = renderToStaticMarkup(
      <ProfilePageContent user={user} credits={1} tryOnHistory={[]} />,
    );
    const classes = new Set(
      [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)),
    );
    const read = (path: string) =>
      readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
    const themes = read("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
    const compiler = await compile(
      `${read("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
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
    const checks = [
      ["grid-cols-[96px_minmax(0,1fr)]", "grid-template-columns", "96px minmax(0,1fr)"],
      ["rounded-full", "border-radius", "calc(infinity * 1px)"],
      ["size-[96px]", "width", "96px"],
      ["size-[96px]", "height", "96px"],
      ["object-cover", "object-fit", "cover"],
      ["row-span-1", "grid-row", "span 1 / span 1"],
      ["md:row-span-2", "grid-row", "span 2 / span 2"],
      ["col-span-2", "grid-column", "span 2 / span 2"],
      ["col-start-1", "grid-column-start", "1"],
      ["md:col-span-1", "grid-column", "span 1 / span 1"],
      ["md:col-start-2", "grid-column-start", "2"],
      ["row-start-2", "grid-row-start", "2"],
      ["min-w-0", "min-width", "calc(var(--spacing) * 0)"],
      ["max-w-full", "max-width", "100%"],
      ["w-fit", "width", "fit-content"],
      ["justify-self-center", "justify-self", "center"],
      ["md:justify-self-start", "justify-self", "flex-start"],
      ["break-words", "overflow-wrap", "break-word"],
      ["break-all", "word-break", "break-all"],
      ["whitespace-normal", "white-space", "normal"],
      ["h-auto", "height", "auto"],
      ["min-h-[48px]", "min-height", "48px"],
      ["text-[30px]", "font-size", "30px"],
      ["lg:text-[48px]", "font-size", "48px"],
      ["leading-[1.2]", "line-height", "1.2"],
      ["flex", "display", "flex"],
      ["md:mx-auto", "margin-inline", "auto"],
      ["md:max-w-[1200px]", "max-width", "1200px"],
      ["pt-[18px]", "padding-top", "18px"],
      ["pb-[6px]", "padding-bottom", "6px"],
      ["md:pb-[12px]", "padding-bottom", "12px"],
      ["pt-0", "padding-top", "calc(var(--spacing) * 0)"],
      ["pb-[24px]", "padding-bottom", "24px"],
      ["lg:pb-[42px]", "padding-bottom", "42px"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), name).toContain(`${property}: ${value};`);
    expect(utility("lg:text-[48px]")).toContain("@media (width >= 64rem)");
    for (const name of [
      "grid-cols-[96px_minmax(0,1fr)]",
      "row-span-1",
      "col-span-2",
      "col-start-1",
      "row-start-2",
      "w-fit",
      "justify-self-center",
    ])
      expect(utility(name), name).not.toContain("@media");
    // Installed default md = 48rem (768px); center is base, start only from md.
    for (const name of [
      "md:row-span-2",
      "md:col-span-1",
      "md:col-start-2",
      "md:justify-self-start",
      "md:not-sr-only",
      "md:pt-0",
      "md:mx-auto",
      "md:max-w-[1200px]",
      "md:pb-[12px]",
    ])
      expect(utility(name)).toContain("@media (width >= 48rem)");
    expect(utility("md:justify-self-start")).not.toContain("@media (width >= 40rem)");
    expect(utility("sr-only")).toContain("position: absolute;");
    expect(utility("md:not-sr-only")).toContain("position: static;");
    expect(utility("md:pt-0")).toContain("padding-top: calc(var(--spacing) * 0);");
    expect(utility("md:mb-[18px]")).toContain("margin-bottom: 18px;");
    expect(utility("flex")).not.toContain("@media");
    expect(utility("pt-0")).not.toContain("@media");
    expect(utility("lg:pb-[42px]")).toContain("@media (width >= 64rem)");
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    console.info(
      `R1 CSS: ${classes.size} rendered candidates; ${checks.length} declarations, full-span mobile button, md column-2 placement/intro, lg media and focus verified in memory.`,
    );
  });
});
