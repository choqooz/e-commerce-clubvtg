import { readFileSync } from "node:fs";
import Image, { getImageProps, type ImageProps } from "next/image";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressiveImage } from "./progressive-image";

// Real helper and Next getImageProps; explicit hooks/element callbacks only.
// No mounted browser, image network, computed CSS or hydration timing proof.
const hooks = vi.hoisted(() => ({
  active: true,
  slots: [] as unknown[],
  index: 0,
  effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(),
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (initial: unknown) => {
      if (!hooks.active) return real.useState(initial);
      const i = hooks.index++;
      if (!(i in hooks.slots)) hooks.slots[i] = initial;
      return [
        hooks.slots[i],
        (value: unknown) => {
          hooks.slots[i] = typeof value === "function" ? value(hooks.slots[i]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!hooks.active) return real.useRef(initial);
      const i = hooks.index++;
      return hooks.slots[i] ?? (hooks.slots[i] = { current: initial });
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      if (!hooks.active) return real.useEffect(effect, deps);
      const i = hooks.index++;
      const before = hooks.slots[i] as unknown[] | undefined;
      if (!before || deps.some((value, index) => value !== before[index])) {
        hooks.slots[i] = deps;
        hooks.effects.push(() => {
          hooks.cleanups.get(i)?.();
          const cleanup = effect();
          if (cleanup) hooks.cleanups.set(i, cleanup);
          else hooks.cleanups.delete(i);
        });
      }
    },
  };
});
type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
const nodes = (tree: ReactNode): Element[] =>
  Children.toArray(tree).flatMap((child) =>
    isValidElement(child) ? [child as Element, ...nodes((child as Element).props.children)] : [],
  );
let props: ImageProps;
let tree: Element;
const render = (changes: Partial<ImageProps> = {}) => {
  props = { ...props, ...changes };
  hooks.index = 0;
  tree = ProgressiveImage(props) as Element;
  return tree;
};
const main = () => nodes(tree).find((node) => node.type === Image)!;
const preview = () => nodes(tree).find((node) => node.props["data-image-preview"] !== undefined);
const frameState = () => tree.props["data-state"];
const attach = (complete = false, naturalWidth = 0, naturalHeight = 0) => {
  const element = { complete, naturalWidth, naturalHeight };
  (main().props.ref as { current: unknown }).current = element;
  return element;
};
const flush = () => {
  hooks.effects.splice(0).forEach((effect) => effect());
  render();
};
const fire = (node: Element, handler: "onLoad" | "onError", element: unknown) =>
  (node.props[handler] as (event: unknown) => void)({ currentTarget: element });
const failPreview = () => {
  const tiny = preview()!;
  const element = {};
  (tiny.props.ref as { current: unknown }).current = element;
  fire(tiny, "onError", element);
};

beforeEach(() => {
  hooks.active = true;
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanups.clear();
  props = {
    src: "/portrait.jpg",
    alt: "Camisa",
    width: 800,
    height: 1200,
    style: { width: "100%", height: "auto" },
  };
});
afterEach(() => {
  hooks.cleanups.forEach((cleanup) => cleanup());
  hooks.cleanups.clear();
  vi.unstubAllGlobals();
  hooks.active = true;
});

describe("Progressive storefront photos", () => {
  it("emits a real tiny preview before the main photo in SSR, without duplicate alt or invented ratio", () => {
    hooks.active = false;
    const markup = renderToStaticMarkup(<ProgressiveImage {...props} />);
    expect(markup.match(/<img\b/g)).toHaveLength(2);
    expect(markup).toContain('data-state="initial"');
    const images = markup.match(/<img\b[^>]*>/g)!;
    expect(images[0]).toContain("data-image-preview");
    expect(images[0]).toContain("w=32");
    expect(images[0]).toContain('alt=""');
    expect(images[0]).toContain('aria-hidden="true"');
    expect(images[0]).not.toMatch(/srcSet|sizes=|preload/);
    expect(images[1]).toContain('width="800" height="1200"');
    expect(images[1]).toContain('alt="Camisa"');
    expect(markup.match(/alt="Camisa"/g)).toHaveLength(1);
    expect(markup).not.toContain("aspect-ratio");
  });

  it("requests a real 32px optimizer preview on the first render and retains it while pending", () => {
    render();
    expect(preview()).toBeDefined();
    const siblings = Children.toArray(tree.props.children) as Element[];
    expect(siblings[0].props["data-image-preview"]).toBe(true);
    expect(siblings[1].type).toBe(Image);
    expect(siblings[0].key).not.toBe(siblings[1].key);
    attach();
    flush();
    expect(frameState()).toBe("pending");
    const tiny = preview()!;
    const optimized = getImageProps({ src: props.src, alt: "", width: 16, height: 16 }).props;
    expect(tiny.props.src).toBe(optimized.src);
    expect(new URL(tiny.props.src as string, "https://store.example").searchParams.get("w")).toBe(
      "32",
    );
    expect(tiny.props.src).not.toBe(props.src);
    expect(tiny.props.srcSet).toBeUndefined();
    expect(tiny.props.sizes).toBeUndefined();
    expect(tiny.props).toMatchObject({ alt: "", "aria-hidden": true, loading: "lazy" });
    expect(main().props).toMatchObject(props);
    expect(main().props.fill).toBeUndefined();
  });

  it("keeps distinct stable sibling identities so main failure detaches its preview", () => {
    render();
    const element = attach();
    flush();
    const mainKey = main().key;
    const previewKey = preview()!.key;
    expect(mainKey).not.toBe(previewKey);
    fire(main(), "onLoad", element);
    render();
    expect(main().key).toBe(mainKey);
    expect(preview()!.key).toBe(previewKey);
    fire(main(), "onError", element);
    render();
    expect(frameState()).toBe("error");
    expect(preview()).toBeUndefined();
    expect(Children.toArray(tree.props.children)).toHaveLength(1);
    expect(main().key).toBe(mainKey);
  });

  it("forwards metadata and callbacks once while revealing the full image without a timer", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({
      onLoad,
      onError,
      preload: true,
      fill: true,
      width: undefined,
      height: undefined,
      sizes: "50vw",
      className: "object-cover",
      style: { objectPosition: "35% 50%" },
    });
    const element = attach();
    flush();
    Object.assign(element, { complete: true, naturalWidth: 1600, naturalHeight: 900 });
    fire(main(), "onLoad", element);
    render();
    expect(frameState()).toBe("loaded");
    expect(onLoad).toHaveBeenCalledExactlyOnceWith({ currentTarget: element });
    expect(onError).not.toHaveBeenCalled();
    expect(main().props).toMatchObject({
      fill: true,
      sizes: "50vw",
      preload: true,
      alt: "Camisa",
      className: expect.stringContaining("object-cover"),
      style: { objectPosition: "35% 50%" },
    });
    expect(preview()?.props.style).toMatchObject({ objectPosition: "35% 50%" });
    expect(preview()?.props.loading).toBe("eager");
  });

  it("never replays a reveal for complete cached images or a load before the hydration effect", () => {
    render();
    attach(true, 800, 1200);
    flush();
    expect(frameState()).toBe("cached");
    expect(preview()).toBeUndefined();
    fire(main(), "onLoad", (main().props.ref as { current: unknown }).current);
    render();
    expect(frameState()).toBe("cached");
    hooks.slots = [];
    hooks.effects = [];
    render();
    const element = attach(true, 800, 1200);
    fire(main(), "onLoad", element);
    flush();
    expect(frameState()).toBe("cached");
    expect(preview()).toBeUndefined();
  });

  it("waits for a hydration-complete photo's decode, then exposes it cached without a replay or callback", async () => {
    let decoded!: () => void;
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          decoded = resolve;
        }),
    );
    const onLoad = vi.fn();
    render({ onLoad });
    const element = attach(true, 800, 1200);
    Object.assign(element, { decode });
    flush();
    expect(decode).toHaveBeenCalledOnce();
    expect(frameState()).toBe("initial");
    expect(preview()).toBeDefined();
    decoded();
    await Promise.resolve();
    render();
    expect(frameState()).toBe("cached");
    expect(preview()).toBeUndefined();
    expect(onLoad).not.toHaveBeenCalled();
    fire(main(), "onLoad", element); // Next owns this callback after its decode.
    render();
    expect(frameState()).toBe("cached");
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("settles a complete photo even when decode rejects, matching Next's fallback without a fake error callback", async () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({ onLoad, onError });
    const element = attach(true, 800, 1200);
    Object.assign(element, { decode: () => Promise.reject(new Error("decode unavailable")) });
    flush();
    expect(frameState()).toBe("initial");
    await Promise.resolve();
    render();
    expect(frameState()).toBe("cached");
    expect(preview()).toBeUndefined();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not let a late cached decode settle a replacement source or an unmounted photo", async () => {
    let decoded!: () => void;
    render();
    const old = attach(true, 800, 1200);
    Object.assign(old, {
      decode: () =>
        new Promise<void>((resolve) => {
          decoded = resolve;
        }),
    });
    flush();
    render({ src: "/landscape.jpg" });
    attach();
    flush();
    decoded();
    await Promise.resolve();
    render();
    expect(frameState()).toBe("pending");
    expect(preview()?.props.src).toContain(encodeURIComponent("/landscape.jpg"));
    hooks.slots = [];
    hooks.effects = [];
    render();
    const detached = attach(true, 800, 1200);
    Object.assign(detached, {
      decode: () =>
        new Promise<void>((resolve) => {
          decoded = resolve;
        }),
    });
    flush();
    hooks.cleanups.forEach((cleanup) => cleanup());
    decoded();
    await Promise.resolve();
    render();
    expect(frameState()).toBe("initial");
  });

  it("resets on source changes and ignores stale main/preview events", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({ onLoad, onError });
    const oldElement = attach();
    flush();
    const oldMain = main();
    const oldPreview = preview()!;
    fire(main(), "onLoad", oldElement);
    render();
    render({ src: "/landscape.jpg" });
    expect(frameState()).toBe("initial");
    expect(preview()?.props.src).toContain(encodeURIComponent("/landscape.jpg"));
    const nextElement = attach();
    flush();
    fire(oldMain, "onError", oldElement);
    fire(oldPreview, "onError", {});
    render();
    expect(frameState()).toBe("pending");
    expect(preview()).toBeDefined();
    expect(onError).not.toHaveBeenCalled();
    fire(main(), "onLoad", nextElement);
    render();
    expect(frameState()).toBe("loaded");
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it("ignores a detached preview failure after an A → B → A source sequence", () => {
    render();
    attach();
    flush();
    const detached = preview()!;
    const oldElement = {};
    (detached.props.ref as { current: unknown }).current = oldElement;
    render({ src: "/landscape.jpg" });
    attach();
    flush();
    render({ src: "/portrait.jpg" });
    attach();
    flush();
    (preview()!.props.ref as { current: unknown }).current = {};
    fire(detached, "onError", oldElement);
    render();
    expect(preview()).toBeDefined();
    expect(frameState()).toBe("pending");
  });

  it("ignores detached main load/error events after A → B → A without extra callbacks", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({ onLoad, onError });
    const detachedElement = attach();
    flush();
    const detachedMain = main();
    render({ src: "/landscape.jpg" });
    attach();
    flush();
    render({ src: "/portrait.jpg" });
    const currentElement = attach();
    flush();
    fire(detachedMain, "onLoad", detachedElement);
    fire(detachedMain, "onError", detachedElement);
    render();
    expect(frameState()).toBe("pending");
    expect(preview()).toBeDefined();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    fire(main(), "onLoad", currentElement);
    render();
    expect(frameState()).toBe("loaded");
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("removes a failed preview independently and never hides the full photo when it loads", () => {
    const onError = vi.fn();
    render({ onError });
    const element = attach();
    flush();
    failPreview();
    render();
    expect(preview()).toBeUndefined();
    expect(frameState()).toBe("pending");
    expect(onError).not.toHaveBeenCalled();
    fire(main(), "onLoad", element);
    render();
    expect(frameState()).toBe("loaded");
    expect(main()).toBeDefined();
  });

  it("removes blur on main failure, leaves the neutral fallback, and recovers on a new source", () => {
    const onError = vi.fn();
    render({ onError, alt: "" });
    const element = attach();
    flush();
    fire(main(), "onError", element);
    render();
    expect(frameState()).toBe("error");
    expect(preview()).toBeUndefined();
    expect(main().props.alt).toBe("");
    expect(onError).toHaveBeenCalledOnce();
    render({ src: "/new.jpg" });
    attach();
    flush();
    expect(frameState()).toBe("pending");
    expect(preview()).toBeDefined();
  });

  it("recognizes an already broken image after hydration without replaying callbacks", () => {
    const onError = vi.fn();
    render({ onError });
    attach(true);
    flush();
    expect(frameState()).toBe("error");
    expect(preview()).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    { src: "/vector.svg" },
    { src: "/animation.GIF?version=2" },
    { src: "/photo.jpg", overrideSrc: "/different.jpg" },
    { src: "https://not-allowed.example/photo.jpg", unoptimized: true },
    { src: "/_next/image?url=photo.jpg&w=800" },
    { src: "//example.com/photo.jpg", unoptimized: true },
    { src: "data:image/png;base64,AA==", unoptimized: true },
    { src: "https://not-allowed.example/photo.jpg" },
    { src: "https://project.supabase.co/not-storage/photo.jpg" },
    { src: "https://project.supabase.co.evil.example/storage/v1/object/photo.jpg" },
    { src: "https://project.supabase.co/storage/v1/object/photo.svg" },
    { src: "/unknown-format" },
    { src: "/photo.jpg", loader: ({ src }: { src: string }) => src },
    {
      src: "https://project.supabase.co/storage/v1/object/public/photo.jpg",
      unoptimized: true,
      overrideSrc: "/different.jpg",
    },
    {
      src: "https://project.supabase.co/storage/v1/object/public/photo.jpg",
      unoptimized: true,
      loader: ({ src }: { src: string }) => src,
    },
  ])("uses neutral fallback, never a duplicate full URL, for unsupported props %j", (changes) => {
    render(changes);
    expect(frameState()).toBe("initial");
    expect(preview()).toBeUndefined();
    attach();
    flush();
    expect(frameState()).toBe("pending");
    expect(preview()).toBeUndefined();
    expect(main().props.src).toBe(changes.src);
  });

  it("supports optimized static imports without replacing their intrinsic main-photo dimensions", () => {
    const src = { src: "/_next/static/media/photo.123.jpg", width: 800, height: 1200 };
    render({ src });
    attach();
    flush();
    expect(preview()?.props.src).toContain("w=32");
    expect(preview()?.props.src).toContain(encodeURIComponent(src.src));
    expect(main().props.src).toBe(src);
    expect(main().props).toMatchObject({ width: 800, height: 1200 });
  });

  it.each([
    "/photo.jpg",
    "https://project.supabase.co/storage/v1/object/public/products/photo.jpg",
    "https://img.clerk.com/photo.png",
  ])("allows a tiny preview independently of the direct main-photo policy: %s", (src) => {
    render({ src, unoptimized: true });
    attach();
    flush();
    const tiny = new URL(preview()!.props.src as string, "https://store.example");
    expect(tiny.pathname).toBe("/_next/image");
    expect(tiny.searchParams.get("url")).toBe(src);
    expect(tiny.searchParams.get("w")).toBe("32");
    expect(main().props).toMatchObject({ src, unoptimized: true });
    expect(getImageProps(main().props as ImageProps).props.src).toBe(src);
    expect(getImageProps(main().props as ImageProps).props.srcSet).toBeUndefined();
  });

  it("cancels only these photos' opacity transitions during an intermediate reveal", () => {
    const listeners = new Set<() => void>();
    const motion = {
      matches: false,
      addEventListener: vi.fn((_type, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type, listener: () => void) => listeners.delete(listener)),
    };
    const matchMedia = vi.fn(() => motion);
    vi.stubGlobal("window", { matchMedia, location: { href: "https://store.example/" } });
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({ onLoad, onError });
    const element = attach();
    flush();
    const tinyElement = {};
    (preview()!.props.ref as { current: unknown }).current = tinyElement;
    fire(main(), "onLoad", element);
    render();
    // Model the browser at ~55ms: cancellation must expose the CSS end values,
    // not freeze the interpolated opacity or finish unrelated animations.
    const opacity = { main: 0.152, preview: 1 };
    const mainFade = {
      transitionProperty: "opacity",
      effect: { target: element },
      cancel: vi.fn(() => {
        opacity.main = 1;
      }),
    };
    const previewFade = {
      transitionProperty: "opacity",
      effect: { target: tinyElement },
      cancel: vi.fn(() => {
        opacity.preview = 0;
      }),
    };
    const unrelated = [
      { transitionProperty: "transform", effect: { target: element }, cancel: vi.fn() },
      { effect: { target: element }, cancel: vi.fn() },
      { transitionProperty: "opacity", effect: { target: {} }, cancel: vi.fn() },
    ];
    Object.assign(element, { getAnimations: () => [mainFade, ...unrelated] });
    Object.assign(tinyElement, { getAnimations: () => [previewFade] });
    listeners.forEach((listener) => listener());
    expect(mainFade.cancel).not.toHaveBeenCalled();
    motion.matches = true;
    listeners.forEach((listener) => listener());
    expect(mainFade.cancel).toHaveBeenCalledOnce();
    expect(previewFade.cancel).toHaveBeenCalledOnce();
    expect(opacity).toEqual({ main: 1, preview: 0 });
    unrelated.forEach((animation) => expect(animation.cancel).not.toHaveBeenCalled());
    expect(frameState()).toBe("loaded");
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(prefers-reduced-motion: reduce)");
    const listener = motion.addEventListener.mock.calls[0][1];
    hooks.cleanups.forEach((cleanup) => cleanup());
    hooks.cleanups.clear();
    expect(motion.removeEventListener).toHaveBeenCalledExactlyOnceWith("change", listener);
    expect(listeners.size).toBe(0);
  });

  it.each(["pending", "loaded", "error"] as const)(
    "keeps %s presentation safe when reduced motion starts enabled and getAnimations is absent",
    (status) => {
      const listeners = new Set<() => void>();
      const motion = {
        matches: true,
        addEventListener: vi.fn((_type, listener: () => void) => listeners.add(listener)),
        removeEventListener: vi.fn((_type, listener: () => void) => listeners.delete(listener)),
      };
      vi.stubGlobal("window", {
        matchMedia: () => motion,
        location: { href: "https://store.example/" },
      });
      const onLoad = vi.fn();
      const onError = vi.fn();
      render({ onLoad, onError });
      const element = attach();
      flush();
      expect(frameState()).toBe("pending");
      if (status !== "pending") {
        fire(main(), status === "loaded" ? "onLoad" : "onError", element);
        render();
      }
      expect(() => listeners.forEach((listener) => listener())).not.toThrow();
      expect(frameState()).toBe(status);
      expect(Boolean(preview())).toBe(status !== "error");
      expect(onLoad).toHaveBeenCalledTimes(status === "loaded" ? 1 : 0);
      expect(onError).toHaveBeenCalledTimes(status === "error" ? 1 : 0);
      expect(listeners.size).toBe(1);
    },
  );

  it("keeps pending and preview-error fallback safe when matchMedia is unavailable", () => {
    vi.stubGlobal("window", { location: { href: "https://store.example/" } });
    const onLoad = vi.fn();
    const onError = vi.fn();
    render({ onLoad, onError });
    const element = attach();
    expect(() => flush()).not.toThrow();
    expect(frameState()).toBe("pending");
    failPreview();
    render();
    expect(frameState()).toBe("pending");
    expect(preview()).toBeUndefined();
    fire(main(), "onLoad", element);
    render();
    expect(frameState()).toBe("loaded");
    expect(preview()).toBeUndefined();
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("uses static blur and only scoped opacity transitions; live reduced motion removes duration and delay", () => {
    const css = readFileSync(new URL("./progressive-image.module.css", import.meta.url), "utf8");
    expect(css).toContain("opacity 250ms ease");
    expect(css).toContain("filter: blur(");
    expect(css).not.toMatch(/transition[^;]*(?:filter|all)|@keyframes|aspect-ratio/);
    expect(css).toContain("pointer-events: none");
    expect(css).toMatch(/\.image\s*\{\s*opacity: 0;/);
    for (const state of ["loaded", "cached", "error"])
      expect(css).toContain(`.frame[data-state="${state}"] .image`);
    expect(css).toMatch(
      /@media\s*\(scripting: none\)[\s\S]*\.frame\[data-state\] \.image\s*\{\s*opacity: 1;/,
    );
    expect(css).toMatch(/@media\s*\(scripting: none\)[\s\S]*\.preview\s*\{\s*display: none;/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*transition-duration: 0ms[\s\S]*transition-delay: 0ms/,
    );
    expect(css).toContain("min-height: inherit");
    expect(css).toMatch(/\.frame\[data-state="loaded"\] \.preview\s*\{\s*opacity: 0;/);
    // These selectors match the loaded rules' specificity, so the media query
    // can actually override the transition shorthand during an in-flight fade.
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.frame\[data-state\] \.image/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.frame\[data-state\] \.preview/);
  });
});
