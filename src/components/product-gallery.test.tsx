import { readFileSync } from "node:fs";
import Image, { type ImageProps } from "next/image";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Swiper as SwiperCore } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";
import { ProductGallery } from "./product-gallery";
import { ProgressiveImage } from "./progressive-image";

// Node-only callback/effect harness. Swiper React elements are real, but geometry,
// media and the instance API are doubles: this does NOT prove browser swipe/layout/focus.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => {
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.some((v, i) => v !== b[i]);
  return {
    ...(await original<typeof import("react")>()),
    useState: (initial: unknown) => {
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
      const i = hooks.index++;
      return hooks.slots[i] ?? (hooks.slots[i] = { current: initial });
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const i = hooks.index++;
      const previous = hooks.slots[i] as { callback: unknown; deps: unknown[] } | undefined;
      if (!previous || changed(previous.deps, deps)) hooks.slots[i] = { callback, deps };
      return (hooks.slots[i] as { callback: unknown }).callback;
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const i = hooks.index++;
      const previous = hooks.slots[i] as { deps?: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || changed(previous.deps, deps))
        hooks.effects.push(() => {
          previous?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
  };
});

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
const nodes = (tree: ReactNode): Element[] =>
  Children.toArray(tree).flatMap((child) =>
    isValidElement(child) ? [child as Element, ...nodes((child as Element).props.children)] : [],
  );
const product = {
  id: "gallery",
  title: "Camisa vintage",
  category: "tops",
  status: "available",
  image_urls: ["/portrait.jpg", "/landscape.jpg", "/square.jpg"],
} as Product;
let tree: ReactNode;
let frame: { style: { height: string }; getBoundingClientRect: () => { width: number } };
let instance: ReturnType<typeof createInstance>;
let resize: (entries: { contentRect: { width: number } }[]) => void;
let disconnect: ReturnType<typeof vi.fn>;
let desktop: ReturnType<typeof media>;
let motion: ReturnType<typeof media>;
const media = (initial: boolean) => {
  const listeners = new Set<() => void>();
  return {
    matches: initial,
    addEventListener: vi.fn((_name: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_name: string, fn: () => void) => listeners.delete(fn)),
    change(matches: boolean) {
      this.matches = matches;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
};
const carousel = () => nodes(tree).find((node) => node.type === Swiper)!;
const viewport = () => nodes(tree).find((node) => node.props.id === "product-active-image")!;
// Main-photo props/callbacks target the real helper boundary; its Next Image
// forwarding, cache, src reset and preview behavior run in progressive-image.test.
const photos = () => nodes(viewport()).filter((node) => node.type === ProgressiveImage);
const thumbnails = () =>
  nodes(tree).filter((node) => typeof node.props["aria-pressed"] === "boolean");
const button = (name: string) => nodes(tree).find((node) => node.props["aria-label"] === name)!;
const click = (node: Element) => (node.props.onClick as () => void)();
const load = (index: number, width: number, height: number) =>
  (photos()[index].props.onLoad as (event: unknown) => void)({
    currentTarget: { naturalWidth: width, naturalHeight: height },
  });
function createInstance() {
  return {
    activeIndex: 0,
    destroyed: false,
    params: {
      speed: 400,
      direction: "horizontal",
      slidesPerView: 1 as number | string,
      centeredSlides: false,
    },
    slidesGrid: [0, 900, 1237.5],
    updateSize: vi.fn(() => {
      expect(Number.parseFloat(frame.style.height)).toBeGreaterThan(0);
    }),
    updateSlides: vi.fn(),
    updateProgress: vi.fn(),
    updateSlidesClasses: vi.fn(),
    checkOverflow: vi.fn(),
    setTranslate: vi.fn(),
    setTransition: vi.fn(),
    getTranslate: vi.fn(() => -347),
    transitionEnd: vi.fn(),
    update: vi.fn(),
    updateAutoHeight: vi.fn(),
    changeDirection: vi.fn(function (this: { params: { direction: string } }, direction: string) {
      this.params.direction = direction;
    }),
    slideTo: vi.fn((index: number, speed: number) => {
      instance.activeIndex = index;
      instance.setTransition(speed);
      (carousel().props.onSlideChange as (api: unknown) => void)(instance);
    }),
  };
}
function render(overrides: Partial<Product> = {}) {
  hooks.index = 0;
  tree = ProductGallery({ product: { ...product, ...overrides } });
  return tree;
}
const flush = () => {
  const effects = hooks.effects.splice(0);
  effects.forEach((effect) => effect());
};
function mount(isDesktop = false, isReduced = false) {
  desktop = media(isDesktop);
  motion = media(isReduced);
  vi.stubGlobal("window", {
    matchMedia: vi.fn((query: string) => (query.includes("1024") ? desktop : motion)),
  });
  disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: typeof resize) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  render();
  frame = { style: { height: "96px" }, getBoundingClientRect: () => ({ width: 600 }) };
  (viewport().props.ref as { current: unknown }).current = frame;
  instance = createInstance();
  (carousel().props.onSwiper as (api: unknown) => void)(instance);
  flush();
}
beforeEach(() => {
  hooks.slots = [];
  hooks.index = 0;
  hooks.effects = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Product gallery Swiper contract", () => {
  it("has an SSR-safe, noncollapsed single viewport and no global keyboard/autoplay/loop modules", () => {
    render(); // No window or ResizeObserver reads during render.
    expect(viewport().props.style).toEqual({ height: 96 });
    expect(carousel().props).toMatchObject({
      speed: 400,
      autoHeight: false,
      loop: false,
      rewind: false,
      resizeObserver: false,
      updateOnWindowResize: false,
      lazyPreload: false,
    });
    expect(carousel().props.modules).toBeUndefined();
    expect(carousel().props.keyboard).toBeUndefined();
    expect(carousel().props.autoplay).toBeUndefined();
    expect(carousel().props.effect).toBeUndefined();
    expect(nodes(tree).filter((node) => node.type === SwiperSlide)).toHaveLength(3);
    expect(photos().map((node) => node.props.preload)).toEqual([true, false, false]);
    expect(photos().map((node) => node.props.loading)).toEqual([undefined, "lazy", "lazy"]);
    for (const photo of photos()) {
      expect(photo.props.alt).toBe(product.title);
      expect(photo.props.style).toEqual({ width: "100%", height: "auto" });
      expect(photo.props.fill).toBeUndefined();
    }
  });

  it.each([{ image_urls: ["/portrait.jpg"] }, { image_urls: product.image_urls }])(
    "renders every single/multi main photo through the real SSR-preview helper: $image_urls",
    ({ image_urls }) => {
      render({ image_urls });
      const mains = photos();
      expect(mains.map((node) => node.props.src)).toEqual(image_urls);
      for (const photo of mains) {
        hooks.slots = [];
        hooks.index = 0;
        hooks.effects = [];
        const helper = ProgressiveImage(photo.props as unknown as ImageProps) as Element;
        const images = nodes(helper).filter((node) => node.type === Image || node.type === "img");
        expect(helper.props["data-state"]).toBe("initial");
        expect(images).toHaveLength(2);
        expect(images[0].props).toMatchObject({
          "data-image-preview": true,
          alt: "",
          "aria-hidden": true,
        });
        expect(images[0].props.src).toContain("w=32");
        expect(images[1].type).toBe(Image);
        expect(images[1].props).toMatchObject({
          src: photo.props.src,
          width: 0,
          height: 0,
          alt: product.title,
        });
        expect(images[0].key).not.toBe(images[1].key);
      }
    },
  );

  it("routes natural metadata and errors through the real helper, not a replacement Image mock", () => {
    mount(true);
    const onLoad = vi.fn(photos()[0].props.onLoad as NonNullable<ImageProps["onLoad"]>);
    const helper = ProgressiveImage({ ...photos()[0].props, onLoad } as unknown as ImageProps);
    const full = nodes(helper).find((node) => node.type === Image)!;
    const element = { complete: false, naturalWidth: 800, naturalHeight: 1200 };
    (full.props.ref as { current: unknown }).current = element;
    flush();
    (full.props.onLoad as (event: unknown) => void)({ currentTarget: element });
    render();
    flush();
    expect(onLoad).toHaveBeenCalledOnce();
    expect(photos()[0].props).toMatchObject({ width: 800, height: 1200 });
    expect(frame.style.height).toBe("900px");

    // Thumbnail/control images remain ordinary Next Image elements.
    expect(nodes(thumbnails()[0]).filter((node) => node.type === Image)).toHaveLength(1);
    expect(nodes(thumbnails()[0]).filter((node) => node.type === ProgressiveImage)).toHaveLength(0);
    const onError = vi.fn(photos()[1].props.onError as NonNullable<ImageProps["onError"]>);
    const failedHelper = ProgressiveImage({
      ...photos()[1].props,
      onError,
    } as unknown as ImageProps);
    const failed = nodes(failedHelper).find((node) => node.type === Image)!;
    const broken = { complete: false, naturalWidth: 0, naturalHeight: 0 };
    (failed.props.ref as { current: unknown }).current = broken;
    flush();
    (failed.props.onError as (event: unknown) => void)({ currentTarget: broken });
    render();
    flush();
    expect(onError).toHaveBeenCalledOnce();
    click(thumbnails()[1]);
    render();
    flush();
    expect(viewport().props["aria-busy"]).toBe(false);
    expect(frame.style.height).toBe("96px");
    expect(
      nodes(tree).some(
        (node) => node.props.children === "No pudimos cargar esta imagen. Probá otra vista.",
      ),
    ).toBe(true);
  });

  it("uses actual vertical direction at lg, derives mixed natural heights, and updates width live", () => {
    mount(true);
    expect(instance.changeDirection).toHaveBeenLastCalledWith("vertical", false);
    expect(instance.params.slidesPerView).toBe("auto");
    expect(frame.style.height).toBe("96px");
    load(0, 800, 1200);
    load(1, 1600, 900);
    load(2, 1000, 1000);
    render();
    flush();
    expect(frame.style.height).toBe("900px");
    click(thumbnails()[1]);
    render();
    flush();
    expect(frame.style.height).toBe("337.5px");
    expect(instance.setTranslate).toHaveBeenLastCalledWith(-900);
    expect(instance.slideTo).toHaveBeenLastCalledWith(1, 400);
    expect(instance.setTransition).toHaveBeenLastCalledWith(400);
    resize([{ contentRect: { width: 400 } }]);
    expect(frame.style.height).toBe("225px");
    const calls = instance.updateSlides.mock.calls.length;
    resize([{ contentRect: { width: 400 } }]);
    expect(instance.updateSlides).toHaveBeenCalledTimes(calls);
    desktop.change(false);
    expect(instance.changeDirection).toHaveBeenLastCalledWith("horizontal", false);
    expect(instance.params.slidesPerView).toBe(1);
    expect(instance.params.centeredSlides).toBe(false);
    expect(frame.style.height).toBe("225px");
    desktop.change(true);
    click(thumbnails()[2]);
    render();
    flush();
    expect(frame.style.height).toBe("400px");
    expect(instance.update).not.toHaveBeenCalled();
    expect(instance.updateAutoHeight).not.toHaveBeenCalled();
    expect(instance.setTransition).toHaveBeenLastCalledWith(400);
  });

  it("retains every vertical snap when a tall active photo precedes short/unloaded photos (installed Swiper math)", () => {
    mount(true);
    const core = new SwiperCore({
      init: false,
      direction: "vertical",
      slidesPerView: "auto",
      centeredSlides: instance.params.centeredSlides,
      watchOverflow: false,
    });
    const slides = [900, 96, 96].map((height) => ({
      style: {},
      matches: () => true,
      offsetHeight: height,
      offsetWidth: 600,
      clientWidth: 600,
    }));
    const computed = (slide: { offsetHeight: number }) => ({
      getPropertyValue: (name: string) =>
        ({ height: `${slide.offsetHeight}px`, display: "block", "box-sizing": "border-box" })[
          name
        ] ?? "0",
    });
    vi.stubGlobal("HTMLSlotElement", class {});
    vi.stubGlobal("getComputedStyle", computed);
    vi.stubGlobal("window", { getComputedStyle: computed });
    Object.assign(core, {
      el: { classList: { contains: () => false, add: vi.fn() } },
      slidesEl: { children: slides },
      wrapperEl: { style: {} },
      size: 900,
    });
    core.updateSlides(); // Actual installed 14.3.0, only DOM measurements are synthetic.
    expect(core.snapGrid).toHaveLength(3);
    expect(core.snapGrid).toEqual(core.slidesGrid);
    core.size = 96;
    core.updateSlides();
    // The selected short photo's center becomes its natural top at its own viewport height.
    expect(core.snapGrid[1]).toBe(900);
  });

  it("keeps unknown/error slides bounded and recovers to another URL without borrowing a ratio", () => {
    mount(true);
    load(0, 800, 1200);
    render();
    flush();
    click(thumbnails()[1]);
    render();
    flush();
    expect(frame.style.height).toBe("96px");
    expect(viewport().props["aria-busy"]).toBe(true);
    load(1, 0, 0);
    render();
    flush();
    expect(viewport().props["aria-busy"]).toBe(true);
    (photos()[1].props.onError as () => void)();
    render();
    flush();
    expect(frame.style.height).toBe("96px");
    expect(viewport().props["aria-busy"]).toBe(false);
    const error = nodes(tree).find((node) => node.props["data-active"] === true)!;
    expect(error.props.style).toEqual({ minHeight: 96 });
    expect(
      nodes(error).some(
        (node) => node.props.children === "No pudimos cargar esta imagen. Probá otra vista.",
      ),
    ).toBe(true);
    click(thumbnails()[0]);
    render();
    flush();
    expect(frame.style.height).toBe("900px");
    expect(thumbnails().map((node) => node.props["aria-pressed"])).toEqual([true, false, false]);
  });

  it("uses semantic local buttons, nonwrapping boundaries and accepts swipe-selected state", () => {
    mount();
    expect(button("Vista anterior").props.disabled).toBe(true);
    click(button("Vista anterior"));
    expect(instance.slideTo).not.toHaveBeenCalled();
    click(button("Vista siguiente"));
    render();
    flush();
    expect(thumbnails().map((node) => node.props["aria-pressed"])).toEqual([false, true, false]);
    instance.activeIndex = 2;
    (carousel().props.onSlideChange as (api: unknown) => void)(instance);
    render();
    flush();
    expect(button("Vista siguiente").props.disabled).toBe(true);
    const calls = instance.slideTo.mock.calls.length;
    click(button("Vista siguiente"));
    expect(instance.slideTo).toHaveBeenCalledTimes(calls);
    for (const node of [...thumbnails(), button("Vista anterior"), button("Vista siguiente")]) {
      expect(node.props.type).toBe("button");
      expect(node.props["aria-controls"]).toBe("product-active-image");
      expect(node.props.onKeyDown).toBeUndefined();
    }
  });

  it("settles live motion at the selected endpoint, restores speed, and removes observers/listeners", () => {
    mount(false, true);
    expect(instance.params.speed).toBe(0);
    click(thumbnails()[1]);
    render();
    flush();
    expect(instance.slideTo).toHaveBeenLastCalledWith(1, 0);
    motion.change(false);
    expect(instance.params.speed).toBe(400);
    click(thumbnails()[2]);
    render();
    flush();
    motion.change(true);
    expect(instance.setTransition).toHaveBeenLastCalledWith(0);
    expect(instance.setTranslate).toHaveBeenLastCalledWith(-instance.slidesGrid[2]);
    expect(instance.transitionEnd).toHaveBeenCalled();
    for (const slot of hooks.slots) (slot as { cleanup?: () => void })?.cleanup?.();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(desktop.listeners.size).toBe(0);
    expect(motion.listeners.size).toBe(0);
    (carousel().props.onBeforeDestroy as () => void)();
    resize([{ contentRect: { width: 300 } }]); // Teardown is harmless.
  });

  it.each([
    { isDesktop: false, action: "Vista siguiente", start: 0, selected: 1 },
    { isDesktop: false, action: "Vista anterior", start: 1, selected: 0 },
    { isDesktop: true, action: "Vista siguiente", start: 0, selected: 1 },
    { isDesktop: true, action: "Vista anterior", start: 1, selected: 0 },
  ])(
    "cancels only wrapper transform transitions on live reduction: desktop=$isDesktop $action",
    ({ isDesktop, action, start, selected }) => {
      mount(isDesktop);
      load(0, 300, 600);
      load(1, 600, 300);
      render();
      flush();
      click(thumbnails()[start]);
      render();
      flush();
      click(button(action));
      render();
      flush();
      const transform = {
        transitionProperty: "transform",
        playState: "running",
        cancel: vi.fn(() => {
          transform.playState = "idle";
          expect(instance.setTransition).toHaveBeenLastCalledWith(0);
        }),
      };
      const opacity = { transitionProperty: "opacity", cancel: vi.fn() };
      const keyframes = { cancel: vi.fn() }; // A non-transition Animation is unrelated.
      const getAnimations = vi.fn(() => [transform, opacity, keyframes]);
      Object.assign(instance, { wrapperEl: { getAnimations } });
      instance.setTranslate.mockClear();
      motion.change(true);
      expect(getAnimations).toHaveBeenCalledWith(); // Wrapper only, not its descendants.
      expect(transform.cancel).toHaveBeenCalledOnce();
      expect(transform.playState).toBe("idle");
      expect(opacity.cancel).not.toHaveBeenCalled();
      expect(keyframes.cancel).not.toHaveBeenCalled();
      expect(transform.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        instance.setTranslate.mock.invocationCallOrder[0],
      );
      expect(instance.setTranslate).toHaveBeenLastCalledWith(-instance.slidesGrid[selected]);
      expect(frame.style.height).toBe(selected === 0 ? "1200px" : "300px");
      motion.change(false);
      expect(instance.params.speed).toBe(400);
      expect(transform.cancel).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { isDesktop: false, width: 390, intermediate: -159.369, endpoint: -390 },
    { isDesktop: true, width: 840, intermediate: -686.882, endpoint: -1680 },
  ])(
    "settles an interrupted mixed-ratio slide with real Swiper state at width $width",
    ({ isDesktop, width, intermediate, endpoint }) => {
      mount(isDesktop);
      load(0, 300, 600);
      load(1, 600, 300);
      load(2, 600, 600);
      render();
      flush();
      const core = new SwiperCore({
        init: false,
        direction: isDesktop ? "vertical" : "horizontal",
        slidesPerView: isDesktop ? "auto" : 1,
        centeredSlides: isDesktop,
        watchOverflow: false,
      });
      // Real Swiper grids/slideTo/translate/index/progress/transition APIs; only
      // DOM measurements and the in-flight computed transform are synthetic.
      const slides = [2, 0.5, 1].map((ratio) => ({
        style: {},
        matches: () => true,
        getAttribute: () => null,
        offsetHeight: width * ratio,
        offsetWidth: width,
        clientWidth: width,
      }));
      const computed = (slide: (typeof slides)[number]) => ({
        getPropertyValue: (name: string) =>
          ({
            width: `${slide.offsetWidth}px`,
            height: `${slide.offsetHeight}px`,
            display: "block",
            "box-sizing": "border-box",
          })[name] ?? "0",
      });
      vi.stubGlobal("HTMLSlotElement", class {});
      vi.stubGlobal("getComputedStyle", computed);
      // Keep the media listener closures installed by mount().
      Object.assign(window, { getComputedStyle: computed });
      const wrapper = {
        style: { transform: "", transitionDuration: "" },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      Object.assign(core, {
        el: { classList: { contains: () => false, add: vi.fn() } },
        slidesEl: { children: slides },
        wrapperEl: wrapper,
        updateSize: () => {
          core.size = isDesktop ? Number.parseFloat(frame.style.height) : width;
        },
        updateSlidesClasses: vi.fn(),
      });
      core.on("slideChange", (api) =>
        (carousel().props.onSlideChange as (api: SwiperCore) => void)(api),
      );
      (carousel().props.onSwiper as (api: SwiperCore) => void)(core);
      resize([{ contentRect: { width } }]);
      click(thumbnails()[1]);
      render();
      flush();
      expect(core.activeIndex).toBe(1);
      expect(core.animating).toBe(true);
      expect(core.translate).toBe(endpoint);
      const renderedPosition = vi.spyOn(core, "getTranslate").mockReturnValue(intermediate);
      expect(core.getTranslate()).not.toBe(endpoint);
      motion.change(true);
      expect(core.translate).toBe(endpoint);
      expect(wrapper.style.transform).toBe(
        isDesktop ? `translate3d(0px, ${endpoint}px, 0px)` : `translate3d(${endpoint}px, 0px, 0px)`,
      );
      expect(frame.style.height).toBe(`${width / 2}px`);
      expect(core.snapGrid[1]).toBe(-endpoint);
      expect(core.activeIndex).toBe(1);
      expect(core.realIndex).toBe(1);
      expect(core.snapIndex).toBe(1);
      expect(core.progress).toBeCloseTo(
        (endpoint - core.minTranslate()) / (core.maxTranslate() - core.minTranslate()),
      );
      expect(core.animating).toBe(false);
      expect(wrapper.style.transitionDuration).toBe("0ms");
      renderedPosition.mockRestore();
      for (const [action, index, ratio] of [
        ["Vista anterior", 0, 2],
        ["thumbnail", 2, 1],
        ["Vista anterior", 1, 0.5],
        ["Vista siguiente", 2, 1],
      ] as const) {
        click(action === "thumbnail" ? thumbnails()[index] : button(action));
        render();
        flush();
        expect(core.activeIndex).toBe(index);
        expect(core.realIndex).toBe(index);
        expect(core.snapIndex).toBe(index);
        expect(core.translate).toBe(-core.snapGrid[index]);
        expect(core.animating).toBe(false);
        expect(frame.style.height).toBe(`${width * ratio}px`);
      }
      motion.change(false);
      click(thumbnails()[0]);
      render();
      flush();
      expect(core.params.speed).toBe(400);
      expect(wrapper.style.transitionDuration).toBe("400ms");
      expect(core.animating).toBe(true);
      expect(core.activeIndex).toBe(0);
      expect(core.translate).toBe(-core.snapGrid[0]);
    },
  );

  it.each([{ image_urls: [] }, { image_urls: ["/portrait.jpg"] }])(
    "keeps <=1 images simple with no Swiper, controls or media listeners: $image_urls",
    ({ image_urls }) => {
      render({ image_urls });
      flush();
      expect(nodes(tree).some((node) => node.type === Swiper)).toBe(false);
      expect(nodes(tree).some((node) => node.type === "button")).toBe(false);
      expect(viewport().props.style).toBeUndefined();
      expect(photos()).toHaveLength(image_urls.length);
    },
  );

  it("authors only transform movement with ease and clips the viewport, not a fixed/cropped photo frame", () => {
    const css = readFileSync(new URL("./product-gallery.module.css", import.meta.url), "utf8");
    expect(css).toContain("transition-property: transform;");
    expect(css).toContain("transition-timing-function: ease;");
    expect(css).toMatch(/\.viewport\s*\{\s*overflow: hidden;/);
    expect(css).toMatch(/\.swiper \.slide\s*\{\s*height: auto;/);
    expect(css).not.toMatch(
      /aspect-ratio|object-fit|transition:\s*all|transition-property:.*height/,
    );
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
