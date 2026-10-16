import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, TryOnStep } from "@/lib/types";
// Shallow state/SSR only. No effects, browser, upload, network or generation.
const probe = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  setters: [] as ReturnType<typeof vi.fn>[],
  fetch: vi.fn(),
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
  }) => (
    // SSR boundary mock: no Next image loader or image request is exercised.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} sizes={sizes} />
  ),
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("@/components/credits/credit-balance", () => ({
  CreditBalance: ({ credits }: { credits: number }) => <span data-credits={credits} />,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  DialogPortal: ({ children }: { children: ReactNode }) => children,
  DialogOverlay: () => <div />,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { GenerationProgress } from "./try-on/generation-progress";
import { ImageUploader } from "./try-on/image-uploader";
import { ImageZoomModal } from "./try-on/image-zoom-modal";
import { ResultViewer } from "./try-on/result-viewer";
import { TryOnHistory } from "./try-on/try-on-history";
import { TryOnPageContent } from "./try-on/try-on-page-content";
import { TryOnSection } from "./try-on-section";

beforeEach(() => {
  vi.clearAllMocks();
  probe.states = [];
  probe.index = 0;
  probe.setters = [];
  vi.stubGlobal("fetch", probe.fetch);
});
const paths = [
  "src/components/try-on-section.tsx",
  "src/components/try-on/try-on-page-content.tsx",
  "src/components/try-on/image-uploader.tsx",
  "src/components/try-on/generation-progress.tsx",
  "src/components/try-on/result-viewer.tsx",
  "src/components/try-on/try-on-history.tsx",
  "src/components/try-on/image-zoom-modal.tsx",
] as const;
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// Filled from the live pretask source before any V6 component changes; never recomputed.
const PRETASK_DIGESTS = [
  "edcc66f5417453fb6cee6f52b81812e139ecab8b6883822ffbbfd16c5f561668",
  "9ddd5b1a099b40e5d14c264b7db478ba6a11fa09645e83b2a2acb074bc9a54d2",
  "68ab15ae713a7419a59efa2031ecc66bb9f1b44db4dcf1cba0b18906eade5075",
  "766a6dcdd31daa27f1de5042711d05eef82315846b9116697546fa7c7a6d5cbe",
  "918c9dc074a8b0b41dcb5b5d122d4b1ed06e7b3fa28d6c12768160ca4f6e506a",
  "7be1fcaa637610bdb8fb0928c81946106c28e6d0390e14a05f68821e3c2ea309",
  "0f6d97f03740cc0c307ad1e116092323313ed86f06993a2ce1baaf8a43823773",
];
// Normalize V6 grouping/a11y and T1's named control presentation, not event/data props.
function originalPresentation(text: string, path: string): string {
  if (path.endsWith("try-on-section.tsx"))
    text = text
      .replace(/<(\/?)section\b/g, "<$1div")
      .replace(/\s+aria-label="Probátelo virtualmente"/g, "");
  if (path.endsWith("try-on-page-content.tsx"))
    text = text
      .replace(/<(\/?)section\b/g, "<$1div")
      .replace(/\s+(?:id|aria-labelledby)="try-on-(?:product|upload|progress|result)-heading"/g, "")
      .replace(/\s+aria-label="Prueba virtual"/g, "")
      .replace(
        /<header className="[^"]*">\s*(<CreditBalance credits=\{credits\} \/>)\s*<\/header>/g,
        "$1",
      );
  if (path.endsWith("image-uploader.tsx"))
    text = text
      .replace(/\s+role="(?:status|alert)"/g, "")
      .replace(/\s+aria-disabled=\{disabled\}/g, "");
  if (path.endsWith("generation-progress.tsx"))
    text = text.replace(/\s+aria-current=\{status === "current" \? "step" : undefined\}/g, "");
  if (path.endsWith("result-viewer.tsx"))
    text = text
      // Undo only T1's sibling-control relocation and named icon-only presentation.
      // Captured image, handler, link and filename expressions remain in the baseline.
      .replace(
        /<div className="[^"]*">\s*(<button\b[\s\S]*?<\/button>)\s*\{\/\* Sibling link stays above the image trigger without dispatching zoom\. \*\/\}\s*(<a\b[\s\S]*?<\/a>)\s*<\/div>(\s*<\/figure>\s*<\/div>)/,
        (_, button: string, download: string, end: string) => {
          const trigger = button
            .replace(/\s+title=\{`Ampliar resultado: \$\{productTitle\}`\}/, "")
            .replace(
              /<span\s+aria-hidden="true"\s+className="[^"]*"\s*>\s*(<ZoomIn\b[^>]*\/>)\s*<\/span>/,
              "{/* Hover hint overlay */}<div><span>$1\nClick para ampliar\n</span></div>",
            );
          const link = download
            .replace(/\s+aria-label="Descargar resultado"/, "")
            .replace(/\s+title="Descargar resultado"/, "")
            .replace(
              /(<Download\b[^>]*?) aria-hidden="true"( \/>)\s*(<\/a>)/,
              "$1$2\nDescargar resultado\n$3",
            );
          return `${trigger}${end}{/* Download link */}<div>${link}</div>`;
        },
      )
      .replace(/<(\/?)figure\b/g, "<$1div")
      .replace(/<(\/?)figcaption\b/g, "<$1p");
  if (path.endsWith("try-on-history.tsx"))
    text = text
      .replace(/<(\/?)article\b/g, "<$1div")
      .replace(/\s+role="(?:list|listitem)"/g, "")
      .replace(/\s+aria-label=\{item.product_title\}/g, "");
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
    .update(JSON.stringify(behavior(parse(originalPresentation(text, path)))))
    .digest("hex");

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
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

describe("V6 immutable pretask business baseline", () => {
  it.each(paths)("preserves full nonpresentation syntax: %s", (path) => {
    expect(digest(source(path), path)).toBe(PRETASK_DIGESTS[paths.indexOf(path)]);
  });
  it("rejects upload, resizing, SSE, guards, credits, history, result and zoom mutations", () => {
    for (const [index, before, after] of [
      [0, "/try-on/${productSlug}", "/product/${productSlug}"],
      [1, 'fetch("/api/ai/process"', 'fetch("/api/other"'],
      [1, 'formData.append("image", imageFile)', 'formData.append("photo", imageFile)'],
      [1, 'buffer.split("\\n\\n")', 'buffer.split("\\n")'],
      [1, "event.creditsRemaining", "0"],
      [1, "Math.max(0, prev - 1)", "Math.max(0, prev - 2)"],
      [1, '"no_person_detected"', '"other"'],
      [1, 'event.code === "insufficient_credits"', 'event.code === "other"'],
      [1, 'state.phase === "idle" && credits > 0', 'state.phase === "idle" && credits >= 0'],
      [1, "onImageSelect={startGeneration}", "onImageSelect={handleRetry}"],
      [1, "onClick={handleRetry}", "onClick={startGeneration}"],
      [1, "Se descontará 1 crédito", "Se descontará 2 créditos"],
      [2, "10 * 1024 * 1024", "20 * 1024 * 1024"],
      [2, "Math.min(1, maxW / srcW, maxH / srcH)", "Math.max(1, maxW / srcW, maxH / srcH)"],
      [2, '"image/jpeg",\n        0.95', '"image/jpeg",\n        0.5'],
      [2, "onImageSelect(resized)", "onImageSelect(file)"],
      [2, "URL.revokeObjectURL(preview)", "URL.revokeObjectURL(objectUrl)"],
      [2, 'e.target.value = ""', 'e.target.value = "other"'],
      [3, "stepIndex < currentIndex", "stepIndex <= currentIndex"],
      [3, "Verificando contenido…", "Paso nuevo…"],
      [4, "setZoomOpen(true)", "setZoomOpen(false)"],
      [4, "src={resultImageUrl}", "src={originalImageUrl}"],
      [4, "clubvtg-tryon-", "other-"],
      [
        5,
        'item.status === "completed" && item.result_image_url',
        'item.status === "failed" && item.result_image_url',
      ],
      [5, 'toLocaleDateString("es-AR"', 'toLocaleDateString("en-US"'],
      [5, 'parsed.protocol === "https:"', 'parsed.protocol === "data:"'],
      [5, "onError={handleError}", "onError={undefined}"],
      [6, "const MAX_SCALE = 2", "const MAX_SCALE = 3"],
      [6, "scale(${scale}) translate(${position.x}px, ${position.y}px)", "scale(1)"],
      [6, "passive: false", "passive: true"],
      [6, "releasePointerCapture(e.pointerId)", "setPointerCapture(e.pointerId)"],
      [6, 'maxHeight: "90vh"', 'maxHeight: "100vh"'],
    ] as const) {
      const path = paths[index];
      const original = source(path);
      expect(original).toContain(before);
      expect(digest(original.replace(before, after), path), `${path}: ${before}`).not.toBe(
        digest(original, path),
      );
    }
  });
  it("accepts only equivalent JSX formatter spaces and rejects meaningful text/prop changes", () => {
    const inline = "<p>Restantes: {credits} créditos.</p>";
    const wrapped = '<p>\n Restantes: {credits}{" "}\n créditos.\n</p>';
    expect(behavior(parse(wrapped))).toEqual(behavior(parse(inline)));
    for (const text of [
      wrapped.replace('{" "}', ""),
      wrapped.replace("Restantes:", "Balance:"),
      wrapped.replace("{credits}", "{0}"),
    ])
      expect(behavior(parse(text))).not.toEqual(behavior(parse(inline)));
  });
});

describe("V6 presentation normalization boundaries", () => {
  it("allows only the named grouping and announcements, never alternative labels or semantics", () => {
    for (const [index, before, after] of [
      [0, 'aria-label="Probátelo virtualmente"', 'aria-label="Other"'],
      [1, 'id="try-on-upload-heading"', 'id="other-heading"'],
      [1, 'aria-label="Prueba virtual"', 'aria-label="Other"'],
      [2, "aria-disabled={disabled}", "aria-disabled={false}"],
      [2, 'role="status"', 'role="dialog"'],
      [3, 'aria-current={status === "current" ? "step" : undefined}', 'aria-current="step"'],
      [4, 'aria-label="Descargar resultado"', 'aria-label="Other"'],
      [4, 'title="Descargar resultado"', 'title="Other"'],
      [4, "title={`Ampliar resultado: ${productTitle}`}", 'title="Other"'],
      [4, 'aria-hidden="true"', 'aria-hidden="false"'],
      [4, "href={resultImageUrl}", "href={originalImageUrl}"],
      [4, "onClose={() => setZoomOpen(false)}", "onClose={() => setZoomOpen(true)}"],
      [5, "aria-label={item.product_title}", 'aria-label="Other"'],
    ] as const) {
      const path = paths[index];
      const original = source(path);
      expect(original).toContain(before);
      expect(digest(original.replace(before, after), path)).not.toBe(digest(original, path));
    }
  });
});

describe("V6 actual workflow composition (shallow SSR, not browser proof)", () => {
  it("keeps the embedded product invitation grouped with its cost and full-width mobile action", () => {
    const tree = TryOnSection({ productSlug: garment.slug });
    expect(tree.type).toBe("section");
    expect(tree.props["aria-label"]).toBe("Probátelo virtualmente");
    const markup = html(tree);
    expect(markup).toContain(`href="/try-on/${garment.slug}"`);
    expect(markup).toContain("Usa 1 crédito por generación");
    expect(markup).toContain("min-h-[48px]");
  });
  it.each([
    { phase: "idle", credits: 2, heading: "try-on-upload-heading" },
    { phase: "idle", credits: 0, heading: null },
    { phase: "generating", credits: 2, heading: "try-on-progress-heading", step: "content_check" },
    {
      phase: "complete",
      credits: 1,
      heading: "try-on-result-heading",
      resultUrl: "https://example.test/result.jpg",
      creditsRemaining: 1,
    },
    { phase: "error", credits: 1, heading: null, message: "Error inesperado. Intentá de nuevo." },
  ])(
    "groups the $phase workflow without invoking processing ($credits credits)",
    ({ credits, heading, ...state }) => {
      probe.states = [state, credits, "blob:fixture-original"];
      const tree = TryOnPageContent({ product: garment, initialCredits: credits });
      const nodes = descendants(tree);
      const product = nodes.find(
        (node) => node.props["aria-labelledby"] === "try-on-product-heading",
      )!;
      expect(product.type).toBe("section");
      expect(descendants(product).find((node) => node.type === "h1")?.props.id).toBe(
        "try-on-product-heading",
      );
      const flow = nodes.find(
        (node) => node.type === "section" && node.props["aria-label"] === "Prueba virtual",
      )!;
      expect(flow.props.className).toContain("lg:border-l");
      if (heading) {
        const group = descendants(flow).find((node) => node.props["aria-labelledby"] === heading)!;
        expect(group.type).toBe("section");
        expect(descendants(group).find((node) => node.type === "h2")?.props.id).toBe(heading);
      }
      const markup = html(tree);
      expect(markup).toContain("lg:grid-cols-[5fr_7fr]");
      expect(markup).toContain(`href="/product/${garment.slug}"`);
      expect(markup.includes("Arrastrá tu foto acá")).toBe(state.phase === "idle" && credits > 0);
      if (credits === 0) expect(markup).toContain('href="/credits"');
      for (const node of descendants(flow).filter(
        (node) => typeof node.props.onClick === "function",
      ))
        expect(node.props.className).toContain("min-h-[48px]");
      expect(probe.fetch).not.toHaveBeenCalled();
      expect(probe.setters.every((setter) => setter.mock.calls.length === 0)).toBe(true);
    },
  );
  it("keeps complete-without-original from manufacturing a result", () => {
    probe.states = [
      { phase: "complete", resultUrl: "https://example.test/result.jpg", creditsRemaining: 1 },
      1,
      null,
    ];
    const markup = html(TryOnPageContent({ product: garment, initialCredits: 1 }));
    expect(markup).not.toContain("try-on-result-heading");
    expect(markup).not.toContain("Descargar resultado");
  });
  it("makes the uploader disabled state explicit without changing keyboard or MIME handling", () => {
    const tree = ImageUploader({ onImageSelect: vi.fn(), disabled: true });
    const drop = descendants(tree).find((node) => node.props.role === "button")!;
    expect(drop.props["aria-disabled"]).toBe(true);
    expect(drop.props.tabIndex).toBe(-1);
    expect(drop.props.className).toContain("min-h-[280px]");
    expect(html(tree)).toContain('accept="image/jpeg,image/png,image/webp"');
  });
  it.each([false, true])(
    "keeps preview change/remove controls comfortably sized and disabled: %s",
    (disabled) => {
      probe.states = ["blob:fixture-original", false, null, false];
      const nodes = descendants(ImageUploader({ onImageSelect: vi.fn(), disabled }));
      const remove = nodes.find((node) => node.props["aria-label"] === "Quitar imagen")!;
      expect(remove.props.className).toContain("size-[48px]");
      expect(remove.props.disabled).toBe(disabled);
      const change = nodes.find((node) => node.props.onClick && node !== remove)!;
      expect(change.props.className).toContain("min-h-[48px]");
      expect(change.props.disabled).toBe(disabled);
    },
  );
  it("announces only existing resizing and validation feedback", () => {
    probe.states = [null, false, null, true];
    expect(html(ImageUploader({ onImageSelect: vi.fn() }))).toContain('role="status"');
    probe.index = 0;
    probe.states = [null, false, "La imagen supera los 10 MB.", false];
    const markup = html(ImageUploader({ onImageSelect: vi.fn() }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("La imagen supera los 10 MB.");
  });
  it.each([
    "validating",
    "uploading",
    "processing",
    "content_check",
    "generating",
    "finalizing",
  ] as TryOnStep[])("marks exactly the active existing stage: %s", (currentStep) => {
    const tree = GenerationProgress({ currentStep, isGenerating: true });
    const items = descendants(tree).filter((node) => node.props.role === "listitem");
    expect(items).toHaveLength(6);
    expect(items.filter((node) => node.props["aria-current"] === "step")).toHaveLength(1);
    expect(html(tree)).toContain("bg-warm-sand");
    expect(html(tree)).not.toContain("% completo");
  });
  it("does not mark a current stage while inactive", () => {
    expect(
      html(GenerationProgress({ currentStep: "generating", isGenerating: false })),
    ).not.toContain('aria-current="step"');
  });
  it("keeps original/result as captioned photographs with an in-image download control", () => {
    const tree = ResultViewer({
      originalImageUrl: "blob:fixture-original",
      resultImageUrl: "https://example.test/result.jpg",
      productTitle: garment.title,
    });
    const nodes = descendants(tree);
    const figures = nodes.filter((node) => node.type === "figure");
    expect(figures).toHaveLength(2);
    expect(
      figures.map(
        (figure) => descendants(figure).find((node) => node.type === "figcaption")?.props.children,
      ),
    ).toEqual(["Tu foto", ["Probándote: ", garment.title]]);
    const download = nodes.find((node) => node.type === "a")!;
    expect(download.props.className).toContain("size-[48px]");
    expect(descendants(figures[1])).toContainEqual(download);
    expect(download.props["aria-label"]).toBe("Descargar resultado");
    expect(download.props.href).toBe("https://example.test/result.jpg");
    expect(download.props.download).toBe("clubvtg-tryon-camisa-vintage.jpg");
    const trigger = nodes.find(
      (node) => node.props["aria-label"] === `Ampliar resultado: ${garment.title}`,
    )!;
    (trigger.props.onClick as () => void)();
    expect(probe.setters[0]).toHaveBeenCalledWith(true);
  });
  it("groups history records without truncating product titles or changing status imagery", () => {
    const tree = TryOnHistory({
      items: ["completed", "failed", "processing"].map((status, index) => ({
        id: String(index),
        user_id: "fixture-user",
        product_id: garment.id,
        user_image_url: "https://example.test/original.jpg",
        result_image_url: "https://example.test/result.jpg",
        product_title: garment.title,
        product_image: "https://example.test/product.jpg",
        status: status as "completed" | "failed" | "processing",
        credits_charged: 1,
        error_message: null,
        created_at: garment.created_at,
        updated_at: garment.updated_at,
      })),
    });
    expect(tree.props.role).toBe("list");
    const records = descendants(tree).filter((node) => node.type === "article");
    expect(records).toHaveLength(3);
    expect(
      records.every(
        (node) => node.props.role === "listitem" && node.props["aria-label"] === garment.title,
      ),
    ).toBe(true);
    const markup = html(tree);
    expect(markup).not.toContain("line-clamp");
    for (const label of ["Completado", "Fallido", "Procesando"]) expect(markup).toContain(label);
  });
  it("keeps one zoom close control and the exact zoom transform contract", () => {
    probe.states = [2, { x: 12, y: -6 }, false, true];
    const tree = ImageZoomModal({
      src: "https://example.test/result.jpg",
      alt: "Resultado original",
      open: true,
      onClose: vi.fn(),
    });
    const nodes = descendants(tree);
    const buttons = nodes.filter((node) => node.type === "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props["aria-label"]).toBe("Cerrar");
    expect(buttons[0].props.className).toContain("size-[48px]");
    expect(nodes.find((node) => node.type === "img")?.props.style).toMatchObject({
      transform: "scale(2) translate(12px, -6px)",
      maxWidth: "90vw",
      maxHeight: "90vh",
      touchAction: "none",
    });
    expect(html(tree)).toContain("2.0x");
  });
  it("compiles responsive workflow columns and real 48px control sizes in installed Tailwind", async () => {
    const classes = new Set(
      paths.flatMap((path) =>
        [...source(path).matchAll(/className="([^"]+)"/g)].flatMap((match) =>
          match[1].split(/\s+/),
        ),
      ),
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    for (const [name, property, value] of [
      ["lg:grid-cols-[5fr_7fr]", "grid-template-columns", "5fr 7fr"],
      ["size-[48px]", "width", "48px"],
      ["size-[48px]", "height", "48px"],
      ["min-h-[48px]", "min-height", "48px"],
      ["h-[48px]", "height", "48px"],
    ]) {
      expect(classes.has(name)).toBe(true);
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
      const start = css.indexOf(selector);
      expect(start, name).toBeGreaterThanOrEqual(0);
      expect(css.slice(start, css.indexOf("}", start) + 1)).toContain(`${property}: ${value};`);
    }
    expect(css).toContain("@media (width >= 64rem)");
  });
});
