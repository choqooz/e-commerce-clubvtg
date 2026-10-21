import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Link from "next/link";
import { Children, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLoading from "@/app/product/[slug]/loading";
import { CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import * as storefront from "@/components/storefront-transition";
import { StorefrontLink, StorefrontTransition } from "@/components/storefront-transition";
import { finishPendingCatalogTransition } from "./catalog-transition";

const probe = vi.hoisted(() => ({
  api: undefined as unknown,
  scoped: false,
  effects: [] as (() => void | (() => void))[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  get ViewTransition() {
    return probe.api;
  },
  useContext: () => probe.scoped,
  useLayoutEffect: (effect: () => void | (() => void)) => probe.effects.push(effect),
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
vi.mock("./catalog-transition", () => ({
  finishPendingCatalogTransition: vi.fn(),
  runCatalogTransition: (update: () => void) => update(),
}));

type Element = ReactElement<Record<string, unknown>>;
const css = () => readFileSync(new URL("./storefront-transition.css", import.meta.url), "utf8");
afterEach(() => {
  probe.api = undefined;
  probe.scoped = false;
  probe.effects = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Scoped storefront page transitions", () => {
  it("renders visible SSR content with stable React's missing API", () => {
    const markup = renderToStaticMarkup(
      <StorefrontTransition>
        <main>Always readable</main>
      </StorefrontTransition>,
    );
    expect(markup).toContain("<main>Always readable</main>");
    expect(markup).not.toMatch(/hidden|opacity:0|display:none/);
  });
  it("renders an SSR scope around live chrome and MAIN without adding a layout or focus box", () => {
    const markup = renderToStaticMarkup(
      <StorefrontTransition>
        <header>Live header</header>
        <storefront.StorefrontContentTransition>
          <main>Content</main>
        </storefront.StorefrontContentTransition>
        <footer>Live footer</footer>
      </StorefrontTransition>,
    );
    expect(markup).toBe(
      '<div data-storefront-scope="" style="display:contents"><header>Live header</header><main class="storefront-entry">Content</main><footer>Live footer</footer></div>',
    );
  });
  it("retires SSR bootstrap permanently on hydration while releasing mounted ownership", () => {
    const attributes = new Map<string, string>();
    const setAttribute = vi.fn((name: string, value: string) => attributes.set(name, value));
    const removeAttribute = vi.fn((name: string) => attributes.delete(name));
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { documentElement: { setAttribute, removeAttribute } });
    StorefrontTransition({ children: "Content" });
    expect(attributes.size).toBe(0); // Server/render work must never mutate the document.
    const cleanup = probe.effects[0]() as () => void;
    expect(setAttribute.mock.calls).toEqual([
      ["data-storefront-transition", ""],
      ["data-storefront-transition-ready", ""],
    ]);
    cleanup();
    expect([...attributes]).toEqual([["data-storefront-transition-ready", ""]]);
    expect(removeAttribute).toHaveBeenCalledExactlyOnceWith("data-storefront-transition");
  });
  it("keeps the semantic main and its attributes visible in the stable React fallback", () => {
    const markup = renderToStaticMarkup(
      <storefront.StorefrontContentTransition>
        <main className="existing-layout" aria-busy="true" data-storefront-catalog>
          Always readable
        </main>
      </storefront.StorefrontContentTransition>,
    );
    expect(markup).toContain(
      '<main class="storefront-entry existing-layout" aria-busy="true" data-storefront-catalog="true">',
    );
    expect(markup).toContain("Always readable</main>");
    expect(markup).not.toMatch(/<div|hidden|opacity:0|display:none/);
  });
  it("selects the installed Next canary API with typed enter/exit/share and no unrelated update animation", () => {
    // Actual bundled export, not a made-up component. This checks wiring, not DOM animation.
    const require = createRequire(import.meta.url);
    probe.api = require("next/dist/compiled/react").ViewTransition;
    expect(probe.api).toBeDefined();
    const main = <main>Page</main>;
    const provider = StorefrontTransition({ children: main }) as Element;
    // Scope owns chrome links/root suppression, but never snapshots the whole page.
    const scope = provider.props.children as Element;
    expect(scope.type).toBe("div");
    expect(scope.props).toMatchObject({
      "data-storefront-scope": "",
      style: { display: "contents" },
    });
    expect(scope.props.children).toBe(main);
    const transition = storefront.StorefrontContentTransition({ children: main }) as Element;
    expect(isValidElement(transition)).toBe(true);
    expect(transition.type).toBe(probe.api);
    expect(transition.props).toMatchObject({
      name: "storefront-page",
      default: "none",
      // Suspense reveals and browser history do not inherit Link transition types.
      enter: "storefront-page-fade",
      exit: { "storefront-navigation": "storefront-page-fade", default: "none" },
      share: "storefront-page-fade",
    });
    const participant = transition.props.children as Element;
    expect(participant.type).toBe("main");
    expect(participant.props.children).toBe("Page");
    expect(participant.props.className).toBe("storefront-entry");
  });
  it("owns root suppression only while mounted and immediately cancels live reduced snapshots", () => {
    const events = new EventTarget();
    const motion = Object.assign(events, { matches: false });
    const cancel = vi.fn();
    const unrelatedCancel = vi.fn();
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal("window", { matchMedia: () => motion });
    vi.stubGlobal("document", {
      documentElement: { setAttribute, removeAttribute },
      getAnimations: () => [
        { effect: { pseudoElement: "::view-transition-new(storefront-page)" }, cancel },
        { effect: { pseudoElement: "::view-transition-new(other-page)" }, cancel: unrelatedCancel },
      ],
    });
    StorefrontTransition({ children: "Content" });
    expect(probe.effects).toHaveLength(1);
    const cleanup = probe.effects[0]() as () => void;
    expect(setAttribute).toHaveBeenCalledWith("data-storefront-transition", "");
    motion.matches = true;
    events.dispatchEvent(new Event("change"));
    expect(cancel).toHaveBeenCalledOnce();
    expect(unrelatedCancel).not.toHaveBeenCalled();
    cleanup();
    expect(removeAttribute).toHaveBeenCalledWith("data-storefront-transition");
    events.dispatchEvent(new Event("change"));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("keeps matching loading chrome inside the page scope but outside its main-only snapshot", () => {
    const loading = ProductLoading();
    expect(loading.type).toBe(StorefrontTransition);
    expect(Object.keys(loading.props)).toEqual(["children"]);
    const shell = loading.props.children as Element;
    expect(shell.type).toBe("div");
    const children = Children.toArray(shell.props.children as React.ReactNode) as Element[];
    expect(children.map((child) => child.type)).toEqual([
      SiteHeader,
      CartDrawer,
      storefront.StorefrontContentTransition,
      SiteFooter,
    ]);
    const main = children[2].props.children as Element;
    expect(main.type).toBe("main");
    expect(main.props["aria-busy"]).toBe("true");
  });
  it("retains scoped root ownership until the last visible boundary cleans up", () => {
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { documentElement: { setAttribute, removeAttribute } });
    StorefrontTransition({ children: "Old page" });
    StorefrontTransition({ children: "New page" });
    const firstCleanup = probe.effects[0]() as () => void;
    const lastCleanup = probe.effects[1]() as () => void;
    firstCleanup();
    expect(removeAttribute).not.toHaveBeenCalled();
    lastCleanup();
    expect(removeAttribute).toHaveBeenCalledOnce();
  });
  it("keeps Next Link semantics rather than a document click interceptor", () => {
    probe.scoped = true;
    const node = StorefrontLink({
      href: "/product/shirt",
      children: "Shirt",
      target: "_blank",
      download: true,
    }) as Element;
    expect(node.type).toBe(Link);
    expect(node.props).toMatchObject({
      href: "/product/shirt",
      target: "_blank",
      download: true,
      transitionTypes: ["storefront-navigation"],
    });
    expect(node.props.onClick).toBeUndefined();
  });
  it.each([
    "/credits",
    "/profile",
    "/orders",
    "/checkout",
    "https://example.com",
    "mailto:shop@example.com",
  ])("does not tag %s", (href) => {
    probe.scoped = true;
    const node = StorefrontLink({ href, children: "Destination" }) as Element;
    expect(node.props.transitionTypes).toBeUndefined();
  });
  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { nativeEvent: { which: 2 } },
    { target: "_blank" },
    { download: true },
    { href: "https://other.example/product/shirt" },
  ])("leaves stable-runtime Next Link click variant %j native", (variant) => {
    // Node resolves Next's Pages-compatible export, not its bundled App Router runtime.
    // Exercise its real click guards with shallow hooks; N4 must cover the App Router too.
    const require = createRequire(import.meta.url);
    const stable = require("react") as typeof import("react");
    vi.spyOn(stable, "useState").mockReturnValue([false, vi.fn()]);
    vi.spyOn(stable, "useRef").mockImplementation((initial) => ({ current: initial }));
    vi.spyOn(stable, "useContext").mockReturnValue({ pathname: "/", asPath: "/" });
    vi.spyOn(stable, "useCallback").mockImplementation((callback) => callback);
    vi.spyOn(stable, "useMemo").mockImplementation((factory) => factory());
    vi.spyOn(stable, "useEffect").mockImplementation(() => {});
    const NativeLink = require("next/link").default as {
      render: (props: unknown, ref: unknown) => Element;
    };
    probe.scoped = true;
    vi.stubGlobal("window", {
      location: { pathname: "/", protocol: "https:", hostname: "store.example", port: "" },
    });
    const onNavigate = vi.fn();
    const wrapped = StorefrontLink({
      href: variant.href ?? "/#catalog",
      children: "Catalog",
      target: variant.target,
      download: variant.download,
      onNavigate,
    }) as Element;
    const anchor = NativeLink.render(wrapped.props, null);
    const preventDefault = vi.fn();
    (anchor.props.onClick as (event: unknown) => void)({
      ...variant,
      preventDefault,
      currentTarget: {
        nodeName: "A",
        getAttribute: () => variant.target ?? null,
        hasAttribute: (name: string) => name === "download" && !!variant.download,
      },
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it("does not tag links outside a storefront wrapper", () => {
    const node = StorefrontLink({ href: "/", children: "Home" }) as Element;
    expect(node.props.transitionTypes).toBeUndefined();
  });
  it("resets a same-document logo visit to the exact home href and emits one notification", () => {
    probe.scoped = true;
    const dispatchEvent = vi.fn();
    const pushState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "?q=shirt&category=tops",
        hash: "#catalog",
        origin: "https://store.example",
      },
      history: { pushState },
      dispatchEvent,
    });
    const node = StorefrontLink({ href: "/", children: "Home" }) as Element;
    const preventDefault = vi.fn();
    (node.props.onNavigate as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledWith(null, "", "/");
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
  it("leaves cross-route navigation to Next's commit-aware transition", () => {
    probe.scoped = true;
    vi.stubGlobal("window", { location: { pathname: "/product/shirt" } });
    const node = StorefrontLink({ href: "/", children: "Home" }) as Element;
    const preventDefault = vi.fn();
    (node.props.onNavigate as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(finishPendingCatalogTransition).toHaveBeenCalledOnce();
  });
  it("honors an onNavigate caller cancellation", () => {
    probe.scoped = true;
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const node = StorefrontLink({
      href: "/#catalog",
      children: "Catalog",
      onNavigate: (event: { preventDefault: () => void }) => event.preventDefault(),
    }) as Element;
    const preventDefault = vi.fn();
    (node.props.onNavigate as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });
  it("hides already-captured root snapshots only for owned or typed storefront transitions", () => {
    const text = css();
    for (const pseudo of ["group", "image-pair", "old", "new"]) {
      const selector = `:root[data-storefront-transition]::view-transition-${pseudo}(root)`;
      const block = text.slice(text.indexOf(selector)).split("}")[0];
      expect(text, selector).toContain(selector);
      for (const type of ["storefront-navigation", "storefront-catalog"]) {
        expect(block).toContain(
          `:root:active-view-transition-type(${type})::view-transition-${pseudo}(root)`,
        );
      }
      expect(block.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")")).toContain(
        `:root:not([data-storefront-transition-ready]):has([data-storefront-scope])::view-transition-${pseudo}(root)`,
      );
      expect(block).toContain("animation: none;");
      expect(block).toContain("display: none;");
      expect(block).toContain("mix-blend-mode: normal;");
      expect(block).toContain("opacity: 1;");
      expect(block).toContain("pointer-events: inherit;");
    }
    expect(text).not.toMatch(/^::view-transition-[\w-]+\(root\)/m);
  });
  it("defines sequential 100ms opacity fades with live zero-motion rules and a scoped pointer overlay", () => {
    const text = css();
    expect(text).toContain("100ms ease-in-out both storefront-fade-out");
    expect(text).toContain("100ms ease-in-out 100ms both storefront-fade-in");
    expect(text).toContain("prefers-reduced-motion: reduce");
    expect(text).toContain("animation-duration: 0s !important");
    expect(text).toContain("animation-delay: 0s !important");
    expect(text).toContain(":active-view-transition-type(storefront-catalog)");
    expect(text).toContain("pointer-events: none");
    expect(text).not.toMatch(/^::view-transition(?:\s|\{|\()/m);
    expect(text).not.toContain("::view-transition-old(*)");
  });
});
