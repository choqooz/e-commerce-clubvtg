import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCatalogTransition } from "@/components/catalog-transition";

vi.mock("react-dom", async (original) => {
  const real = await original<typeof import("react-dom")>();
  return { ...real, flushSync: vi.fn(real.flushSync) };
});

// Contract-level browser double, not snapshot/compositor proof (N4 owns Chrome).
function browser({ deferred = false, reduced = false } = {}) {
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  let update: () => void = () => {};
  let finish: () => void = () => {};
  let rejectReady: (reason: Error) => void = () => {};
  const transition = {
    skipTransition: vi.fn(),
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
    ready: new Promise<void>((_resolve, reject) => {
      rejectReady = reject;
    }),
    updateCallbackDone: Promise.resolve(),
  };
  const startViewTransition = vi.fn((options: { update: () => void; types: string[] }) => {
    update = options.update;
    if (!deferred) update();
    return transition;
  });
  vi.stubGlobal("window", { matchMedia: () => motion });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("document", {
    querySelector: () => ({}),
    startViewTransition,
  });
  return {
    motion,
    transition,
    startViewTransition,
    update: () => update(),
    finish: () => finish(),
    rejectReady: () => rejectReady(new Error("cancelled")),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Synchronous catalog captures", () => {
  it("commits immediately without document/browser support", () => {
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
  it("uses normal content updates when a browser lacks the native API", () => {
    browser();
    Object.assign(document, { startViewTransition: undefined });
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(flushSync).not.toHaveBeenCalled();
  });
  it("does not start an unscoped default root fade in browsers without transition-type selectors", () => {
    const b = browser();
    vi.stubGlobal("CSS", { supports: () => false });
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(b.startViewTransition).not.toHaveBeenCalled();
  });
  it("does not capture when storefront content is absent", () => {
    const b = browser();
    document.querySelector = vi.fn(() => null);
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(b.startViewTransition).not.toHaveBeenCalled();
  });
  it("does not capture reduced motion", () => {
    const b = browser({ reduced: true });
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(b.startViewTransition).not.toHaveBeenCalled();
  });
  it("uses a scoped type and commits within the native update callback", () => {
    const b = browser({ deferred: true });
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).not.toHaveBeenCalled();
    expect(b.startViewTransition.mock.calls[0][0].types).toEqual(["storefront-catalog"]);
    b.update();
    expect(flushSync).toHaveBeenCalledOnce();
    expect(flushSync).toHaveBeenCalledWith(update);
    expect(update).toHaveBeenCalledOnce();
  });
  it("falls back exactly once when the API throws before invoking the callback", () => {
    browser();
    document.startViewTransition = vi.fn(() => {
      throw new Error("unsupported options");
    });
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
  it("does not repeat a committed mutation if the API subsequently throws", () => {
    browser();
    document.startViewTransition = vi.fn((options: { update: () => void }) => {
      options.update();
      throw new Error("capture failed");
    }) as unknown as typeof document.startViewTransition;
    const update = vi.fn();
    runCatalogTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
  it("propagates a synchronous mutation exception without retrying it", () => {
    browser();
    const error = new Error("mutation failed");
    const update = vi.fn(() => {
      throw error;
    });
    expect(() => runCatalogTransition(update)).toThrow(error);
    expect(update).toHaveBeenCalledOnce();
  });
  it("skips the previous capture and preserves both mutations during rapid navigation", async () => {
    const b = browser({ deferred: true });
    const order: string[] = [];
    runCatalogTransition(() => order.push("first"));
    const firstCallback = b.startViewTransition.mock.calls[0][0].update;
    runCatalogTransition(() => order.push("latest"));
    expect(b.transition.skipTransition).toHaveBeenCalledOnce();
    firstCallback();
    b.update();
    b.update();
    expect(order).toEqual(["first", "latest"]);
    b.finish();
    await Promise.resolve();
  });
  it("cancels a running capture on live reduced motion and removes its listener on completion", async () => {
    const b = browser();
    const remove = vi.spyOn(b.motion, "removeEventListener");
    runCatalogTransition(vi.fn());
    b.motion.matches = true;
    b.motion.dispatchEvent(new Event("change"));
    expect(b.transition.skipTransition).toHaveBeenCalledOnce();
    b.finish();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
  it("contains all native promise rejections after a failed asynchronous update without retrying it", async () => {
    const b = browser({ deferred: true });
    const error = new Error("commit rejected");
    const update = vi.fn(() => {
      throw error;
    });
    document.startViewTransition = vi.fn((options: { update: () => void }) => {
      const rejected = Promise.resolve().then(options.update);
      return {
        skipTransition: vi.fn(),
        ready: rejected,
        finished: rejected,
        updateCallbackDone: rejected,
      };
    }) as unknown as typeof document.startViewTransition;
    runCatalogTransition(update);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    expect(b.transition.skipTransition).not.toHaveBeenCalled();
  });
  it("handles cancellation rejection and a callback arriving after finish without losing or repeating the update", async () => {
    const b = browser({ deferred: true });
    const update = vi.fn();
    runCatalogTransition(update);
    b.rejectReady();
    b.finish();
    await Promise.resolve();
    await Promise.resolve();
    b.update();
    expect(update).toHaveBeenCalledOnce();
  });
});
