import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, TryOnStep } from "@/lib/types";
import type { TryOnHistoryItem } from "@/lib/actions/credits";
import { formatPrice } from "@/lib/config";

// Bounded shallow state/SSR fixtures only: no effects, uploads or generation calls.
const probe = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  setState: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = probe.index++;
    return [index < probe.states.length ? probe.states[index] : initial, probe.setState];
  },
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => ({ current: initial }),
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
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/credits/credit-balance", () => ({
  CreditBalance: ({ credits }: { credits: number }) => <span data-credits={credits} />,
}));
vi.mock("@/components/try-on/image-zoom-modal", () => ({
  ImageZoomModal: ({ open, src, alt }: { open: boolean; src: string; alt: string }) => (
    <div data-zoom-open={open} data-src={src} aria-label={alt} />
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { TryOnSection } from "./try-on-section";
import { TryOnPageContent } from "./try-on/try-on-page-content";
import { ImageUploader } from "./try-on/image-uploader";
import { GenerationProgress } from "./try-on/generation-progress";
import { ResultViewer } from "./try-on/result-viewer";
import { TryOnHistory } from "./try-on/try-on-history";
import { ImageZoomModal } from "./try-on/image-zoom-modal";

beforeEach(() => {
  vi.clearAllMocks();
  probe.states = [];
  probe.index = 0;
  vi.stubGlobal("fetch", probe.fetch);
});
// Keep the pre-redesign preservation baseline fixed as the branch gains commits.
const ORIGINAL_PRE_REDESIGN_COMMIT = "910245e38b113341deaa4ae325b0c40b713c2013";

const paths = [
  "src/components/try-on-section.tsx",
  "src/components/try-on/try-on-page-content.tsx",
  "src/components/try-on/image-uploader.tsx",
  "src/components/try-on/generation-progress.tsx",
  "src/components/try-on/result-viewer.tsx",
  "src/components/try-on/try-on-history.tsx",
];
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Same strict normalization as accepted G56B: only classes and JSX formatting.
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
const garment: Product = {
  id: "fixture-garment",
  slug: "camisa-vintage",
  title: "Camisa vintage",
  description: "Lino natural",
  price: 10000,
  size: "M",
  color: "Azul",
  category: "hombre",
  subcategory: "camisas",
  brand: "Original",
  condition: "Muy bueno",
  measurements: "50 × 70 cm",
  image_urls: ["/shirt.jpg"],
  status: "available",
  reserved_at: null,
  created_at: "2026-01-01T12:00:00Z",
  updated_at: "2026-01-01T12:00:00Z",
  product_type_id: null,
  product_subtype_id: null,
};
const historyItem: TryOnHistoryItem = {
  id: "fixture-tryon",
  user_id: "fixture-user",
  product_id: garment.id,
  user_image_url: "https://example.test/original.jpg",
  result_image_url: "https://example.test/result.jpg",
  product_title: garment.title,
  product_image: "https://example.test/garment.jpg",
  status: "completed",
  credits_charged: 1,
  error_message: null,
  created_at: garment.created_at,
  updated_at: garment.updated_at,
};

describe("G56C1 source preservation", () => {
  it.each(paths)(
    "preserves all nonpresentation syntax in %s relative to the original pre-redesign baseline",
    (path) => {
      const baseline = execFileSync("git", ["show", `${ORIGINAL_PRE_REDESIGN_COMMIT}:${path}`], {
        encoding: "utf8",
      });
      expect(behavior(parse(source(path)))).toEqual(behavior(parse(baseline)));
    },
  );
  it("normalizes only classes/formatting, never handlers, guards, copy, links or data", () => {
    const baseline =
      'const options = { className: "old", enabled: true }; const view = <button className="old" disabled={busy} onClick={() => pay(100)}><a href="/credits">Pagar</a></button>;';
    expect(behavior(parse(baseline.replaceAll('"old"', '"new"')))).toEqual(
      behavior(parse(baseline)),
    );
    expect(behavior(parse('const view = (<p className="new">\n  Texto original\n</p>);'))).toEqual(
      behavior(parse('const view = <p className="old">Texto original</p>;')),
    );
    for (const [before, after] of [
      ["enabled: true", "enabled: false"],
      ["busy", "ready"],
      ["pay(100)", "cancel(100)"],
      ["100", "101"],
      ["/credits", "/orders"],
      ["Pagar", "Cancelar"],
      ["Pagar", " Pagar "],
      ["disabled", "hidden"],
    ])
      expect(behavior(parse(baseline.replace(before, after)))).not.toEqual(
        behavior(parse(baseline)),
      );
  });
});

describe("Actual try-on fixtures (not async/browser proof)", () => {
  it("keeps legacy product CTA destination and credit cost", () => {
    const markup = html(<TryOnSection productSlug={garment.slug} />);
    expect(markup).toContain(`href="/try-on/${garment.slug}"`);
    expect(markup).toContain("Probátelo virtualmente");
    expect(markup).toContain("Usa 1 crédito por generación");
  });
  it.each([false, true])("keeps empty uploader keyboard/MIME/disabled contract: %s", (disabled) => {
    const onImageSelect = vi.fn();
    const tree = ImageUploader({ onImageSelect, disabled });
    const drop = descendants(tree).find((element) => element.props.role === "button")!;
    expect(drop.props.tabIndex).toBe(disabled ? -1 : 0);
    for (const name of ["onDrop", "onDragOver", "onDragLeave", "onClick", "onKeyDown"])
      expect(drop.props[name]).toBeTypeOf("function");
    const markup = html(tree);
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).toContain("Máximo 10 MB — JPG, PNG o WebP");
    expect(markup).toContain("Arrastrá tu foto acá");
    expect(onImageSelect).not.toHaveBeenCalled();
  });
  it.each([
    "Formato no soportado. Usá JPG, PNG o WebP.",
    "La imagen supera los 10 MB.",
    "Error al optimizar la imagen. Intentá con otra.",
  ])("keeps uploader error text: %s", (message) => {
    probe.states = [null, false, message, false];
    const markup = html(ImageUploader({ onImageSelect: vi.fn() }));
    expect(markup).toContain(message);
    expect(markup).toContain("border-dotted");
  });
  it.each([false, true])("keeps preview source, reset and disabled controls: %s", (disabled) => {
    probe.states = ["blob:fixture-original", false, null, false];
    const onImageSelect = vi.fn();
    const tree = ImageUploader({ onImageSelect, disabled });
    const markup = html(tree);
    expect(markup).toContain('src="blob:fixture-original"');
    expect(markup).toContain('alt="Vista previa"');
    expect(markup).toContain("Cambiar foto");
    const remove = descendants(tree).find(
      (element) => element.props["aria-label"] === "Quitar imagen",
    )!;
    expect(remove.props.disabled).toBe(disabled);
    expect(remove.props.onClick).toBeTypeOf("function");
    expect(onImageSelect).not.toHaveBeenCalled();
  });
  it("keeps resizing feedback and functional spinner", () => {
    probe.states = [null, false, null, true];
    const markup = html(ImageUploader({ onImageSelect: vi.fn() }));
    expect(markup).toContain("Optimizando para IA...");
    expect(markup).toContain("animate-spin");
    expect(markup).not.toContain('type="file"');
  });
  const steps: TryOnStep[] = [
    "validating",
    "uploading",
    "processing",
    "content_check",
    "generating",
    "finalizing",
  ];
  it.each(steps)("keeps stage icons/list semantics at %s", (currentStep) => {
    const markup = html(<GenerationProgress currentStep={currentStep} isGenerating />);
    const index = steps.indexOf(currentStep);
    expect((markup.match(/role="listitem"/g) ?? []).length).toBe(6);
    expect(markup).toContain('aria-label="Progreso de generación"');
    expect((markup.match(/lucide-check(?: |")/g) ?? []).length).toBe(index);
    expect((markup.match(/lucide-loader-circle /g) ?? []).length).toBe(1);
    expect((markup.match(/lucide-circle(?: |")/g) ?? []).length).toBe(5 - index);
    expect(markup).not.toContain("animate-pulse");
  });
  it.each([
    { currentStep: null, isGenerating: false },
    { currentStep: "generating" as TryOnStep, isGenerating: false },
  ])("keeps pending progress while inactive: %j", (props) => {
    const markup = html(<GenerationProgress {...props} />);
    expect((markup.match(/lucide-circle(?: |")/g) ?? []).length).toBe(6);
    expect(markup).not.toContain("animate-spin");
  });
  it.each([
    { state: { phase: "idle" }, credits: 2, image: null, label: "Subí tu foto", uploader: true },
    { state: { phase: "idle" }, credits: 0, image: null, label: "Sin créditos", uploader: false },
    {
      state: { phase: "generating", step: "processing", message: "Procesando…" },
      credits: 2,
      image: "blob:fixture-original",
      label: "Generando prueba virtual...",
      uploader: false,
    },
    {
      state: {
        phase: "complete",
        resultUrl: "https://example.test/result.jpg",
        creditsRemaining: 1,
      },
      credits: 1,
      image: "blob:fixture-original",
      label: "Resultado",
      uploader: false,
    },
    {
      state: { phase: "error", message: "Error inesperado. Intentá de nuevo." },
      credits: 1,
      image: null,
      label: "Error en la generación",
      uploader: false,
    },
  ])("keeps page phase fixture $label", ({ state, credits, image, label, uploader }) => {
    probe.states = [state, credits, image];
    const markup = html(TryOnPageContent({ product: garment, initialCredits: credits }));
    expect(markup).toContain(label);
    expect(markup.includes("Arrastrá tu foto acá")).toBe(uploader);
    expect(markup).toContain(garment.title);
    expect(markup).toContain(formatPrice(garment.price));
    expect(markup).toContain(`href="/product/${garment.slug}"`);
    if (credits === 0) expect(markup).toContain('href="/credits"');
    if (state.phase === "complete") {
      expect(markup).toContain("Créditos restantes:");
      expect(markup).toContain("Probar otra foto");
    }
    if (state.phase === "error") {
      expect(markup).toContain(state.message);
      expect(markup).toContain("Intentar de nuevo");
    }
    expect(probe.fetch).not.toHaveBeenCalled();
    expect(probe.setState).not.toHaveBeenCalled();
  });
  it("keeps no-product-image fallback without manufacturing imagery", () => {
    const markup = html(
      TryOnPageContent({ product: { ...garment, image_urls: [] }, initialCredits: 0 }),
    );
    expect(markup).toContain("Sin imagen");
    expect(markup).not.toContain('src="/shirt.jpg"');
  });
  it("keeps truthful result/original URLs, download filename and zoom handoff", () => {
    const props = {
      originalImageUrl: "blob:fixture-original",
      resultImageUrl: "https://example.test/result.jpg",
      productTitle: garment.title,
    };
    const tree = ResultViewer(props);
    const markup = html(tree);
    expect(markup).toContain('src="blob:fixture-original"');
    expect(markup).toContain(`src="${props.resultImageUrl}"`);
    expect(markup).toContain('alt="Foto original"');
    expect(markup).toContain(`aria-label="Ampliar resultado: ${garment.title}"`);
    expect(markup).toContain(`href="${props.resultImageUrl}"`);
    expect(markup).toContain('download="clubvtg-tryon-camisa-vintage.jpg"');
    expect(markup).toContain("Click para ampliar");
    expect(markup).not.toMatch(/filter|grayscale|bg-black\/30/);
    const zoom = descendants(tree).find((element) => element.type === ImageZoomModal)!;
    expect(zoom.props.src).toBe(props.resultImageUrl);
    expect(zoom.props.open).toBe(false);
    const trigger = descendants(tree).find((element) => element.type === "button")!;
    (trigger.props.onClick as () => void)();
    expect(probe.setState).toHaveBeenCalledWith(true);
    (zoom.props.onClose as () => void)();
    expect(probe.setState).toHaveBeenCalledWith(false);
  });
  it("keeps empty history catalog destination", () => {
    const markup = html(<TryOnHistory items={[]} />);
    expect(markup).toContain("Aún no probaste ninguna prenda");
    expect(markup).toContain('href="/"');
  });
  it.each([
    { status: "completed" as const, label: "Completado", image: historyItem.result_image_url },
    { status: "failed" as const, label: "Fallido", image: historyItem.product_image },
    { status: "processing" as const, label: "Procesando", image: historyItem.product_image },
  ])("keeps history $status source/status/date", ({ status, label, image }) => {
    const markup = html(<TryOnHistory items={[{ ...historyItem, status }]} />);
    expect(markup).toContain(label);
    expect(markup).toContain(`src="${image}"`);
    expect(markup).toContain(`alt="Prueba: ${garment.title}"`);
    expect(markup).toContain(
      new Date(historyItem.created_at).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    );
  });
  it.each([null, "", "javascript:alert(1)", "data:image/jpeg;base64,fixture"])(
    "keeps history invalid-image fallback: %s",
    (url) => {
      const markup = html(
        <TryOnHistory items={[{ ...historyItem, result_image_url: null, product_image: url }]} />,
      );
      expect(markup).toContain("Sin imagen");
      expect(markup).not.toContain("<img");
    },
  );
  it("keeps failed history thumbnail fallback", () => {
    probe.states = [true];
    expect(html(<TryOnHistory items={[historyItem]} />)).toContain("Sin imagen");
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

describe("In-memory installed Tailwind output for actual try-on classes", () => {
  it("compiles neutral hairlines, dimensions, mobile layouts, focus and functional progress", async () => {
    const classes = new Set(paths.flatMap((path) => classCandidates(source(path))));
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|scale-|transition-|animate-pulse|rounded-(?!none)|font-(bold|semibold|medium|light)|(?:bg|text|border)-(?:accent|destructive|green|red|yellow|blue)/,
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    expect(themes).toHaveLength(2);
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    const utility = (name: string) => {
      expect(classes.has(name), `Actual source candidate: ${name}`).toBe(true);
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
      ["min-h-[36px]", "min-height", "36px"],
      ["w-[24px]", "width", "24px"],
      ["h-[24px]", "height", "24px"],
      ["w-[1px]", "width", "1px"],
      ["min-h-[18px]", "min-height", "18px"],
      ["min-h-[200px]", "min-height", "200px"],
      ["max-h-[450px]", "max-height", "450px"],
      ["max-h-[500px]", "max-height", "500px"],
      ["p-[13px]", "padding", "13px"],
      ["p-[18px]", "padding", "18px"],
      ["p-[24px]", "padding", "24px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[2px]", "padding-block", "2px"],
      ["px-[18px]", "padding-inline", "18px"],
      ["md:px-[30px]", "padding-inline", "30px"],
      ["py-[42px]", "padding-block", "42px"],
      ["gap-[6px]", "gap", "6px"],
      ["gap-[13px]", "gap", "13px"],
      ["gap-[18px]", "gap", "18px"],
      ["gap-[42px]", "gap", "42px"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-dotted", "border-style", "dotted"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["text-midnight-ink", "color", "var(--color-midnight-ink)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[15px]", "font-size", "15px"],
      ["sm:flex-row", "flex-direction", "row"],
      ["md:grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))"],
      ["lg:grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))"],
      ["sm:grid-cols-3", "grid-template-columns", "repeat(3, minmax(0, 1fr))"],
      ["lg:grid-cols-4", "grid-template-columns", "repeat(4, minmax(0, 1fr))"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
    ];
    for (const [name, property, value] of checks)
      expect(utility(name), name).toContain(`${property}: ${value};`);
    for (const [name, width] of [
      ["sm:flex-row", "40rem"],
      ["sm:grid-cols-3", "40rem"],
      ["md:grid-cols-2", "48rem"],
      ["md:px-[30px]", "48rem"],
      ["lg:grid-cols-2", "64rem"],
      ["lg:grid-cols-4", "64rem"],
    ])
      expect(utility(name)).toContain(`@media (width >= ${width})`);
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
    expect(utility("animate-spin")).toContain("animation: var(--animate-spin)");
    for (const [token, value] of [
      ["midnight-ink", "#000000"],
      ["bone-white", "#ffffff"],
      ["warm-sand", "#ebe6dc"],
    ])
      expect(css).toContain(`--color-${token}: ${value};`);
    console.info(
      `G56C1 CSS: ${classes.size} source candidates; ${checks.length} declarations, 6 media, focus/spinner and 3 neutral tokens verified in memory.`,
    );
  });
});
