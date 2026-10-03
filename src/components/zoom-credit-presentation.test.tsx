import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shallow state/event fixtures only. No DOM, effects, image requests or browser gestures.
const probe = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = probe.index++;
    const setter = vi.fn();
    probe.setters[index] = setter;
    return [index < probe.states.length ? probe.states[index] : initial, setter];
  },
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  DialogPortal: ({ children }: { children: ReactNode }) => children,
  DialogOverlay: ({ className }: { className?: string }) => (
    <div data-overlay className={className} />
  ),
  DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}));
import { CreditBalance } from "./credits/credit-balance";
import { ImageZoomModal } from "./try-on/image-zoom-modal";

beforeEach(() => {
  vi.clearAllMocks();
  probe.states = [];
  probe.index = 0;
  probe.setters = [];
});
// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "src/components/credits/credit-balance.tsx",
  "src/components/try-on/image-zoom-modal.tsx",
];
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Ignore classes and formatting only: inline transform, transition, viewport bounds,
// callbacks, pointer math, pinch, passive listener and portal structure must match the pre-redesign baseline.
function behavior(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression);
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
type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const modal = (open = true, onClose = vi.fn()) =>
  ImageZoomModal({
    src: "https://example.test/result.jpg",
    alt: "Resultado original",
    open,
    onClose,
  });
const event = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe("G56C3 source preservation", () => {
  it.each(paths)(
    "preserves non-class syntax relative to the original pre-redesign baseline: %s",
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
  it("rejects callback, transform, dimensions, gesture and copy changes", () => {
    const baseline =
      'const view = <img className="old" alt="Original" onDoubleClick={toggle} style={{ transform: `scale(${scale})`, transition: dragging ? "none" : "transform 0.2s ease-out", maxWidth: "90vw", touchAction: "none" }} />;';
    expect(behavior(parse(baseline.replace('"old"', '"new"')))).toEqual(behavior(parse(baseline)));
    for (const [before, after] of [
      ["Original", "Changed"],
      ["toggle", "close"],
      ["scale(${scale})", "scale(1)"],
      ["90vw", "100vw"],
      ["touchAction", "userSelect"],
      ["0.2s", "0s"],
    ])
      expect(behavior(parse(baseline.replace(before, after)))).not.toEqual(
        behavior(parse(baseline)),
      );
  });
});

describe("Actual credit SSR", () => {
  it.each([0, 1, 2, 120])("preserves numeric credit display and Sparkles icon: %s", (credits) => {
    const tree = CreditBalance({ credits });
    const markup = html(tree);
    expect(markup).toContain(`class="tabular-nums">${credits}</span>`);
    expect(markup).toContain('width="14"');
    expect(markup).toContain('stroke-width="1.5"');
    expect(markup).toContain("lucide-sparkles");
    expect(markup.includes("opacity-50")).toBe(credits === 0);
    expect(tree.props.className).toContain(
      credits === 0 ? "text-midnight-ink/70" : "text-midnight-ink",
    );
    expect(markup).not.toContain("href="); // The existing API is a number span, not a link or plural label.
  });
  it("keeps caller className overrides last through cn", () => {
    const tree = CreditBalance({
      credits: 0,
      className: "gap-[18px] text-[15px] text-bone-white custom-credit",
    });
    expect(tree.props.className).toContain("gap-[18px]");
    expect(tree.props.className).toContain("text-[15px]");
    expect(tree.props.className).toContain("text-bone-white");
    expect(tree.props.className).toContain("custom-credit");
    expect(tree.props.className).not.toContain("gap-[6px]");
    expect(tree.props.className).not.toContain("text-[13px]");
    expect(tree.props.className).not.toContain("text-midnight-ink/70");
  });
});

describe("Actual modal shallow/SSR fixtures (not Radix or browser proof)", () => {
  it.each([true, false])("keeps open prop and single-image portal children: %s", (open) => {
    const tree = modal(open);
    expect(tree.props.open).toBe(open);
    const markup = html(tree);
    if (!open) expect(markup).toBe("");
    else {
      expect(markup).toContain('src="https://example.test/result.jpg"');
      expect(markup).toContain('alt="Resultado original"');
      expect(markup).toContain('class="sr-only">Resultado original</h2>');
      expect(markup).toContain('aria-label="Cerrar"');
      expect(markup).toContain("1.0x");
    }
  });
  it.each([false, true])("retains expanded image transform and drag cursor: %s", (dragging) => {
    probe.states = [2, { x: 12, y: -6 }, dragging, true];
    const tree = modal();
    const image = descendants(tree).find((element) => element.type === "img")!;
    expect(image.props.style).toEqual({
      transform: "scale(2) translate(12px, -6px)",
      transition: dragging ? "none" : "transform 0.2s ease-out",
      maxWidth: "90vw",
      maxHeight: "90vh",
      objectFit: "contain",
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
      userSelect: "none",
    });
    expect(image.props.draggable).toBe(false);
    for (const name of [
      "onDoubleClick",
      "onPointerDown",
      "onPointerMove",
      "onPointerUp",
      "onPointerCancel",
      "onTouchStart",
      "onTouchMove",
    ])
      expect(image.props[name]).toBeTypeOf("function");
    expect(html(tree)).toContain("2.0x");
    expect(html(tree)).not.toMatch(/filter:|grayscale|brightness/);
  });
  it("keeps close, backdrop-only and Dialog callbacks", () => {
    const onClose = vi.fn();
    const tree = modal(true, onClose);
    const elements = descendants(tree);
    const close = elements.find((element) => element.type === "button")!;
    expect(close.props.type).toBe("button");
    expect(close.props.onClick).toBe(onClose);
    (close.props.onClick as () => void)();
    const backdrop = elements.find((element) => element.props.onWheel)!;
    const target = {};
    (backdrop.props.onClick as (event: unknown) => void)({ target: {}, currentTarget: target });
    expect(onClose).toHaveBeenCalledTimes(1);
    (backdrop.props.onClick as (event: unknown) => void)({ target, currentTarget: target });
    (tree.props.onOpenChange as (open: boolean) => void)(true);
    expect(onClose).toHaveBeenCalledTimes(2);
    (tree.props.onOpenChange as (open: boolean) => void)(false);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it("keeps wheel clamp, double-click toggle and position reset", () => {
    const elements = descendants(modal());
    const backdrop = elements.find((element) => element.props.onWheel)!;
    const image = elements.find((element) => element.type === "img")!;
    const wheel = { ...event(), deltaY: -1 };
    (backdrop.props.onWheel as (event: unknown) => void)(wheel);
    const increase = probe.setters[0].mock.calls[0][0];
    expect(increase(1)).toBe(1.1);
    expect(increase(2)).toBe(2);
    expect(wheel.preventDefault).toHaveBeenCalledOnce();
    expect(wheel.stopPropagation).toHaveBeenCalledOnce();
    (backdrop.props.onWheel as (event: unknown) => void)({ ...event(), deltaY: 1 });
    const decrease = probe.setters[0].mock.calls[1][0];
    expect(decrease(1)).toBe(1);
    expect(probe.setters[1]).toHaveBeenCalledWith({ x: 0, y: 0 });
    (image.props.onDoubleClick as (event: unknown) => void)(event());
    const toggle = probe.setters[0].mock.calls[2][0];
    expect(toggle(1)).toBe(2);
    expect(toggle(2)).toBe(1);
  });
  it("keeps pointer capture, scale-adjusted drag coordinates, clamp and cancellation", () => {
    probe.states = [2, { x: 12, y: -6 }, true, true];
    const image = descendants(modal()).find((element) => element.type === "img")!;
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const pointer = { ...event(), target, pointerId: 3, isPrimary: true, clientX: 20, clientY: 30 };
    const down = image.props.onPointerDown as (event: unknown) => void;
    down({ ...pointer, isPrimary: false });
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    down(pointer);
    expect(target.setPointerCapture).toHaveBeenCalledWith(3);
    const move = image.props.onPointerMove as (event: unknown) => void;
    move({ ...pointer, clientX: 40, clientY: 50 });
    expect(probe.setters[1]).toHaveBeenLastCalledWith({ x: 22, y: 4 });
    move({ ...pointer, clientX: 2000, clientY: -2000 });
    expect(probe.setters[1]).toHaveBeenLastCalledWith({ x: 100, y: -100 });
    expect(image.props.onPointerCancel).toBe(image.props.onPointerUp);
    (image.props.onPointerUp as (event: unknown) => void)(pointer);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(probe.setters[2]).toHaveBeenLastCalledWith(false);
  });
  it("keeps pinch bounds and reset", () => {
    const image = descendants(modal()).find((element) => element.type === "img")!;
    const touch = (distance: number) => ({
      ...event(),
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: distance, clientY: 0 },
      ],
    });
    (image.props.onTouchStart as (event: unknown) => void)(touch(10));
    const move = image.props.onTouchMove as (event: unknown) => void;
    move(touch(15));
    expect(probe.setters[0]).toHaveBeenLastCalledWith(1.5);
    move(touch(50));
    expect(probe.setters[0]).toHaveBeenLastCalledWith(2);
    move(touch(5));
    expect(probe.setters[0]).toHaveBeenLastCalledWith(1);
    expect(probe.setters[1]).toHaveBeenLastCalledWith({ x: 0, y: 0 });
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

describe("In-memory actual Tailwind presentation", () => {
  it("keeps flat neutral classes, explicit controls, focus and existing inline viewport bounds", async () => {
    const classes = new Set(paths.flatMap((path) => classCandidates(source(path))));
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|transition|rounded-(?!none)|font-(bold|medium|semibold|light)|scale-|filter|bg-black/,
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
      throw new Error(`Unbalanced utility: ${name}`);
    };
    const checks = [
      ["size-[36px]", "width", "36px"],
      ["size-[36px]", "height", "36px"],
      ["h-[36px]", "height", "36px"],
      ["top-[18px]", "top", "18px"],
      ["right-[18px]", "right", "18px"],
      ["bottom-[18px]", "bottom", "18px"],
      ["gap-[6px]", "gap", "6px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[2px]", "padding-block", "2px"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["leading-[1.2]", "line-height", "1.2"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), name).toContain(`${property}: ${value};`);
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    expect(utility("hover:bg-warm-sand")).toContain("&:hover");
    const image = descendants(modal()).find((element) => element.type === "img")!;
    expect(image.props.style).toMatchObject({
      maxWidth: "90vw",
      maxHeight: "90vh",
      transform: "scale(1) translate(0px, 0px)",
      cursor: "zoom-in",
      touchAction: "none",
    });
    expect(utility("inset-0")).toContain("inset: calc(var(--spacing) * 0)");
    console.info(
      `G56C3 CSS: ${checks.length} declarations, focus/hover and unchanged 90vw/90vh zoom bounds verified in memory.`,
    );
  });
});
