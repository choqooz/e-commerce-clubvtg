import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TryOnStep } from "@/lib/types";
// Shallow callbacks/SSR only: no browser, Radix, image loader or real download.
const probe = vi.hoisted(() => ({ open: false, setOpen: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [probe.open, probe.setOpen],
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));
vi.mock("@/components/try-on/image-zoom-modal", () => ({ ImageZoomModal: () => null }));
import { GenerationProgress } from "./generation-progress";
import { ImageZoomModal } from "./image-zoom-modal";
import { ResultViewer } from "./result-viewer";

beforeEach(() => {
  vi.clearAllMocks();
  probe.open = false;
  probe.setOpen.mockImplementation((open: boolean) => {
    probe.open = open;
  });
});
type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] => {
  const nodes: Element[] = [];
  Children.forEach(node, (child) => {
    if (isValidElement(child))
      nodes.push(child as Element, ...descendants((child as Element).props.children));
  });
  return nodes;
};
const pathTo = (node: ReactNode, target: Element): Element[] => {
  let found: Element[] = [];
  Children.forEach(node, (child) => {
    if (found.length || !isValidElement(child)) return;
    if (child === target) found = [child as Element];
    else {
      const path = pathTo((child as Element).props.children, target);
      if (path.length) found = [child as Element, ...path];
    }
  });
  return found;
};
const fixture = {
  originalImageUrl: "blob:fixture-original",
  resultImageUrl: "https://images.example.test/result.jpg",
  productTitle: "Camisa vintage",
};
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("T1 in-image result controls", () => {
  it("keeps the download and whole-image zoom as siblings inside only the result image", () => {
    const tree = ResultViewer(fixture);
    const nodes = descendants(tree);
    const figures = nodes.filter((node) => node.type === "figure");
    const zoom = nodes.find((node) => node.type === "button")!;
    const download = nodes.find((node) => node.type === "a")!;
    const zoomPath = pathTo(tree, zoom);
    const downloadPath = pathTo(tree, download);
    expect(zoomPath.length).toBeGreaterThan(1);
    expect(downloadPath.at(-2)).toBe(zoomPath.at(-2));
    expect(downloadPath.at(-2)?.props.className).toContain("relative aspect-[3/4]");
    expect(downloadPath.at(-2)?.props.className).toContain("overflow-hidden");
    expect(
      descendants(figures[0]).some((node) => ["a", "button"].includes(String(node.type))),
    ).toBe(false);
    expect(descendants(figures[1])).toContain(download);
    expect(
      descendants(zoom.props.children).some((node) => ["a", "button"].includes(String(node.type))),
    ).toBe(false);
    expect(nodes.filter((node) => node.type === "a")).toHaveLength(1);
    expect(nodes.filter((node) => node.type === "button")).toHaveLength(1);
    expect(zoom.props.className).toContain("absolute inset-0");
    expect(zoom.props.className).toContain("w-full h-full");
    expect(zoom.props.type).toBe("button");
  });
  it("uses named, always-visible icon-only controls with 48px targets and focus styles", () => {
    const tree = ResultViewer(fixture);
    const nodes = descendants(tree);
    const zoom = nodes.find((node) => node.type === "button")!;
    const download = nodes.find((node) => node.type === "a")!;
    const zoomIcon = descendants(zoom).find((node) => node.type === "span")!;
    expect(zoom.props["aria-label"]).toBe(`Ampliar resultado: ${fixture.productTitle}`);
    expect(zoom.props.title).toBe(zoom.props["aria-label"]);
    expect(download.props["aria-label"]).toBe("Descargar resultado");
    expect(download.props.title).toBe(download.props["aria-label"]);
    expect(zoom.props.className).toContain("min-h-[48px] min-w-[48px]");
    for (const control of [download, zoomIcon]) {
      expect(control.props.className).toContain("size-[48px]");
      expect(control.props.className).toContain("bottom-[6px]");
      expect(control.props.className).not.toMatch(/hidden|opacity-0|group-hover/);
      expect(html(control)).not.toContain("Click para ampliar");
      expect(descendants(control).filter((node) => typeof node.type !== "string")).toHaveLength(1);
    }
    expect(zoomIcon.props.className).toContain("right-[6px]");
    expect(download.props.className).toContain("right-[60px]");
    expect(zoomIcon.props["aria-hidden"]).toBe("true");
    expect(descendants(download.props.children)[0].props["aria-hidden"]).toBe("true");
    for (const control of [zoom, download])
      expect(control.props.className).toContain(
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink",
      );
    expect(zoom.props.className).toContain("focus-visible:-outline-offset-2");
    expect(download.props.className).toContain("focus-visible:outline-offset-2");
    expect(html(tree)).not.toMatch(/>\s*(?:Click para ampliar|Descargar resultado)\s*</);
  });
  it.each([
    ["https://images.example.test/result.jpg", "Camisa vintage", "camisa-vintage"],
    ["/result.jpg", "REMERA  de Lino", "remera-de-lino"],
    ["https://other.example.test/result.jpg?v=1", "Vestido Ámbar", "vestido-ámbar"],
  ])("retains native href/download without dispatching zoom: %s", (url, title, filename) => {
    const tree = ResultViewer({ ...fixture, resultImageUrl: url, productTitle: title });
    const download = descendants(tree).find((node) => node.type === "a")!;
    expect(download.props.href).toBe(url);
    expect(download.props.download).toBe(`clubvtg-tryon-${filename}.jpg`);
    expect(download.props.onClick).toBeUndefined();
    // Simulate only shallow bubbling through the link's actual ancestor props.
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const path = pathTo(tree, download);
    expect(path.length).toBeGreaterThan(1);
    for (const node of [...path].reverse())
      if (typeof node.props.onClick === "function") node.props.onClick(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(probe.setOpen).not.toHaveBeenCalled();
    expect(probe.open).toBe(false);
  });
  it("opens and closes the same result with unchanged modal props and image alternatives", () => {
    const tree = ResultViewer(fixture);
    const nodes = descendants(tree);
    const zoom = nodes.find((node) => node.type === "button")!;
    const modal = nodes.find((node) => node.type === ImageZoomModal)!;
    expect(modal.props).toMatchObject({
      src: fixture.resultImageUrl,
      alt: `Resultado probándote ${fixture.productTitle}`,
      open: false,
    });
    const images = nodes.filter((node) => typeof node.props.src === "string" && node !== modal);
    expect(
      images.map((node) => [node.props.src, node.props.alt, node.props.fill, node.props.sizes]),
    ).toEqual([
      [fixture.originalImageUrl, "Foto original", true, "(max-width: 768px) 100vw, 50vw"],
      [
        fixture.resultImageUrl,
        `Resultado probándote ${fixture.productTitle}`,
        true,
        "(max-width: 768px) 100vw, 50vw",
      ],
    ]);
    (zoom.props.onClick as () => void)();
    expect(probe.setOpen).toHaveBeenCalledWith(true);
    const opened = descendants(ResultViewer(fixture)).find((node) => node.type === ImageZoomModal)!;
    expect(opened.props.src).toBe(fixture.resultImageUrl);
    expect(opened.props.open).toBe(true);
    (opened.props.onClose as () => void)();
    expect(probe.setOpen).toHaveBeenLastCalledWith(false);
    expect(
      descendants(ResultViewer(fixture)).find((node) => node.type === ImageZoomModal)?.props.open,
    ).toBe(false);
  });
});

const steps: TryOnStep[] = [
  "validating",
  "uploading",
  "processing",
  "content_check",
  "generating",
  "finalizing",
];
describe("T1 transparent progress marker without status changes", () => {
  it.each(steps)(
    "retains spinner, previous checks, next circles, text and connectors: %s",
    (currentStep) => {
      const tree = GenerationProgress({ currentStep, isGenerating: true });
      const nodes = descendants(tree);
      const items = nodes.filter((node) => node.props.role === "listitem");
      const active = items.filter((node) => node.props["aria-current"] === "step");
      expect(items).toHaveLength(6);
      expect(active).toEqual([items[steps.indexOf(currentStep)]]);
      const marker = descendants(active[0]).find((node) =>
        node.props.className?.includes("w-[24px]"),
      )!;
      expect(marker.props.className).toContain("w-[24px] h-[24px]");
      expect(marker.props.className).not.toMatch(/\b(?:bg-|border)/);
      const markup = html(tree);
      const index = steps.indexOf(currentStep);
      expect((markup.match(/lucide-check(?: |")/g) ?? []).length).toBe(index);
      expect((markup.match(/lucide-loader-circle /g) ?? []).length).toBe(1);
      expect((markup.match(/lucide-circle(?: |")/g) ?? []).length).toBe(5 - index);
      expect(nodes.filter((node) => node.props.className?.includes("w-[1px]"))).toHaveLength(5);
      for (const label of [
        "Validando imagen…",
        "Subiendo foto…",
        "Procesando…",
        "Verificando contenido…",
        "Generando prueba virtual…",
        "Finalizando…",
      ])
        expect(markup).toContain(label);
      expect(markup).toContain("animate-spin");
      expect(markup).not.toContain("bg-bone-white");
      expect(tree.props["aria-label"]).toBe("Progreso de generación");
    },
  );
  it.each([
    { currentStep: null, isGenerating: false },
    { currentStep: null, isGenerating: true },
    { currentStep: "generating" as TryOnStep, isGenerating: false },
  ])("retains all-pending behavior: %j", (props) => {
    const markup = html(GenerationProgress(props));
    expect((markup.match(/lucide-circle(?: |")/g) ?? []).length).toBe(6);
    expect(markup).not.toMatch(/aria-current|animate-spin|lucide-check/);
  });
});

it("compiles the actual icon target, overlay offsets and keyboard focus CSS in memory", async () => {
  const source = readFileSync(new URL("./result-viewer.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile(
    "result.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const classes = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) node.text.split(/\s+/).forEach((name) => classes.add(name));
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(parsed) === "className") collect(node);
    else ts.forEachChild(node, visit);
  };
  visit(parsed);
  const theme = readFileSync(
    new URL("../../../node_modules/tailwindcss/theme.css", import.meta.url),
    "utf8",
  );
  const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const compiler = await compile(
    `${theme}\n${(globals.match(/@theme[^\{]*\{[^}]*\}/g) ?? []).join("\n")}\n@tailwind utilities;`,
  );
  const css = compiler.build([...classes]);
  for (const [name, declarations] of [
    ["size-[48px]", ["width: 48px;", "height: 48px;"]],
    ["min-h-[48px]", ["min-height: 48px;"]],
    ["min-w-[48px]", ["min-width: 48px;"]],
    ["bottom-[6px]", ["bottom: 6px;"]],
    ["right-[6px]", ["right: 6px;"]],
    ["right-[60px]", ["right: 60px;"]],
    ["focus-visible:outline-2", ["&:focus-visible", "outline-width: 2px;"]],
    ["focus-visible:-outline-offset-2", ["&:focus-visible", "outline-offset: calc(2px * -1);"]],
    ["focus-visible:outline-offset-2", ["&:focus-visible", "outline-offset: 2px;"]],
  ] as const) {
    expect(classes.has(name)).toBe(true);
    const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
    const start = css.indexOf(selector);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf("}", start) + 1);
    for (const declaration of declarations) expect(rule, name).toContain(declaration);
  }
});
