import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeferredPostHog } from "./deferred-posthog";

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const sdk = { init: vi.fn(), capture: vi.fn() };
  const loading = pending<typeof sdk>();
  const load = vi.fn(() => loading.promise);
  const now = vi.fn(() => new Date("2026-01-01T00:00:00Z"));
  const deferred = createDeferredPostHog({
    key: "phc_test",
    host: "https://analytics.example",
    load,
    now,
  });
  return { sdk, loading, load, now, deferred };
}
afterEach(() => vi.useRealTimers());

describe("Deferred capture capability", () => {
  it("does not import before start; queues FIFO with original timestamps and properties", async () => {
    const { sdk, loading, load, now, deferred } = setup();
    const capability = deferred.client;
    const properties = { productId: "shirt" };
    capability.capture("product_viewed", properties);
    properties.productId = "changed";
    now.mockReturnValue(new Date("2026-01-01T00:00:01Z"));
    capability.capture("product_added_to_cart", { productId: "shirt" });
    expect(load).not.toHaveBeenCalled();
    const started = deferred.start();
    capability.capture("checkout_started", { cartItemCount: 1, cartTotal: 10000 });
    expect(sdk.capture).not.toHaveBeenCalled();
    loading.resolve(sdk);
    await started;
    expect(sdk.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://analytics.example",
      persistence: "memory",
      disable_session_recording: true,
    });
    expect(sdk.capture.mock.calls).toEqual([
      ["product_viewed", { productId: "shirt" }, { timestamp: new Date("2026-01-01T00:00:00Z") }],
      [
        "product_added_to_cart",
        { productId: "shirt" },
        { timestamp: new Date("2026-01-01T00:00:01Z") },
      ],
      [
        "checkout_started",
        { cartItemCount: 1, cartTotal: 10000 },
        { timestamp: new Date("2026-01-01T00:00:01Z") },
      ],
    ]);
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.capture.mock.invocationCallOrder[0],
    );
    expect(deferred.client).toBe(capability);
    expect(Object.keys(capability)).toEqual(["capture"]);
  });

  it("loads, initializes and flushes once when the mount effect is replayed", async () => {
    const { sdk, loading, load, deferred } = setup();
    deferred.client.capture("product_viewed", {});
    const first = deferred.start();
    const replay = deferred.start();
    expect(replay).toBe(first);
    loading.resolve(sdk);
    await Promise.all([first, replay]);
    await deferred.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledTimes(1);
  });

  it("forwards ready captures on the SDK receiver and swallows unused return values", async () => {
    const { sdk, loading, now, deferred } = setup();
    const started = deferred.start();
    loading.resolve(sdk);
    await started;
    now.mockReturnValue(new Date("2026-01-01T00:00:03Z"));
    expect(deferred.client.capture("checkout_started", { cartTotal: 100 })).toBeUndefined();
    expect(sdk.capture).toHaveBeenCalledWith(
      "checkout_started",
      { cartTotal: 100 },
      {
        timestamp: new Date("2026-01-01T00:00:03Z"),
      },
    );
    expect(sdk.capture.mock.contexts[0]).toBe(sdk);
  });

  it.each([undefined, ""])("never loads or retains captures without a key (%s)", async (key) => {
    const { sdk, load, now } = setup();
    const deferred = createDeferredPostHog({ key, load, now });
    for (let i = 0; i < 200; i++) deferred.client.capture("product_viewed", { i });
    await deferred.start();
    deferred.client.capture("checkout_started", {});
    expect(load).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it.each(["load", "init"])(
    "contains %s failure without retry or later delivery",
    async (stage) => {
      const { sdk, loading, load, deferred } = setup();
      const error = new Error("unavailable");
      deferred.client.capture("product_viewed", {});
      if (stage === "init")
        sdk.init.mockImplementation(() => {
          throw error;
        });
      const started = deferred.start();
      if (stage === "load") loading.reject(error);
      else loading.resolve(sdk);
      await expect(started).resolves.toBeUndefined();
      expect(() => deferred.client.capture("checkout_started", {})).not.toThrow();
      await deferred.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(sdk.capture).not.toHaveBeenCalled();
    },
  );

  it("contains a synchronous loader throw and a ready capture throw", async () => {
    const broken = createDeferredPostHog({
      key: "phc_test",
      load: () => {
        throw new Error("load");
      },
    });
    await expect(broken.start()).resolves.toBeUndefined();
    const { sdk, loading, deferred } = setup();
    const started = deferred.start();
    loading.resolve(sdk);
    await started;
    sdk.capture.mockImplementationOnce(() => {
      throw new Error("capture");
    });
    expect(() => deferred.client.capture("product_viewed", {})).not.toThrow();
    deferred.client.capture("checkout_started", { cartTotal: 100 });
    expect(sdk.capture).toHaveBeenCalledTimes(2);
    expect(sdk.capture).toHaveBeenLastCalledWith(
      "checkout_started",
      { cartTotal: 100 },
      {
        timestamp: new Date("2026-01-01T00:00:00Z"),
      },
    );
  });

  it("bounds the queue to 100 events, preserving the earliest events in order", async () => {
    const { sdk, loading, deferred } = setup();
    for (let i = 0; i < 102; i++) deferred.client.capture("product_viewed", { i });
    const started = deferred.start();
    loading.resolve(sdk);
    await started;
    expect(sdk.capture.mock.calls.map((call) => call[1])).toEqual(
      Array.from({ length: 100 }, (_, i) => ({ i })),
    );
  });

  it("initializes after more than 10 seconds and flushes FIFO once with original timestamps", async () => {
    vi.useFakeTimers();
    const { sdk, loading, load, now, deferred } = setup();
    const capability = deferred.client;
    capability.capture("product_viewed", { productId: "shirt" });
    const started = deferred.start();
    await vi.advanceTimersByTimeAsync(11000);
    expect(sdk.init).not.toHaveBeenCalled();
    now.mockReturnValue(new Date("2026-01-01T00:00:11Z"));
    capability.capture("product_added_to_cart", { productId: "shirt" });
    loading.resolve(sdk);
    await started;
    await deferred.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.capture.mock.calls).toEqual([
      ["product_viewed", { productId: "shirt" }, { timestamp: new Date("2026-01-01T00:00:00Z") }],
      [
        "product_added_to_cart",
        { productId: "shirt" },
        { timestamp: new Date("2026-01-01T00:00:11Z") },
      ],
    ]);
    expect(deferred.client).toBe(capability);
  });

  it("contains a late import rejection without retry or unhandled rejection", async () => {
    vi.useFakeTimers();
    const { sdk, loading, load, deferred } = setup();
    deferred.client.capture("product_viewed", {});
    const started = deferred.start();
    await vi.advanceTimersByTimeAsync(11000);
    loading.reject(new Error("late failure"));
    await expect(started).resolves.toBeUndefined();
    deferred.client.capture("checkout_started", {});
    await deferred.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("continues queued and future valid captures after an individual queued capture throws", async () => {
    const { sdk, loading, now, deferred } = setup();
    deferred.client.capture("product_viewed", { productId: "first" });
    now.mockReturnValue(new Date("2026-01-01T00:00:01Z"));
    deferred.client.capture("product_added_to_cart", { productId: "bad" });
    now.mockReturnValue(new Date("2026-01-01T00:00:02Z"));
    deferred.client.capture("checkout_started", { cartTotal: 100 });
    sdk.capture
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("one bad event");
      });
    const started = deferred.start();
    loading.resolve(sdk);
    await expect(started).resolves.toBeUndefined();
    now.mockReturnValue(new Date("2026-01-01T00:00:03Z"));
    deferred.client.capture("product_viewed", { productId: "future" });
    expect(sdk.capture.mock.calls).toEqual([
      ["product_viewed", { productId: "first" }, { timestamp: new Date("2026-01-01T00:00:00Z") }],
      [
        "product_added_to_cart",
        { productId: "bad" },
        { timestamp: new Date("2026-01-01T00:00:01Z") },
      ],
      ["checkout_started", { cartTotal: 100 }, { timestamp: new Date("2026-01-01T00:00:02Z") }],
      ["product_viewed", { productId: "future" }, { timestamp: new Date("2026-01-01T00:00:03Z") }],
    ]);
    expect(sdk.capture.mock.results.map((result) => result.type)).toEqual([
      "return",
      "throw",
      "return",
      "return",
    ]);
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("buffers during actual initialization and flushes only after it returns", async () => {
    const { sdk, loading, deferred } = setup();
    deferred.client.capture("product_viewed", { productId: "first" });
    sdk.init.mockImplementation(() => {
      deferred.client.capture("product_added_to_cart", { productId: "second" });
      expect(sdk.capture).not.toHaveBeenCalled();
    });
    const started = deferred.start();
    loading.resolve(sdk);
    await started;
    expect(sdk.capture.mock.calls.map((call) => call[0])).toEqual([
      "product_viewed",
      "product_added_to_cart",
    ]);
  });

  it("does not schedule a loading deadline on success or failure", async () => {
    vi.useFakeTimers();
    for (const failed of [false, true]) {
      const { sdk, loading, deferred } = setup();
      const started = deferred.start();
      expect(vi.getTimerCount()).toBe(0);
      if (failed) loading.reject(new Error("load"));
      else loading.resolve(sdk);
      await started;
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
