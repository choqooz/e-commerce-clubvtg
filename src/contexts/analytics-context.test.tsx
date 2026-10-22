import { useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsProvider, useAnalytics } from "./analytics-context";

const probe = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  imports: vi.fn(),
  init: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void) => probe.effects.push(effect),
}));
vi.mock("posthog-js", () => {
  probe.imports();
  return { default: { init: probe.init, capture: probe.capture } };
});
beforeEach(() => {
  vi.clearAllMocks();
  probe.effects = [];
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
});
afterEach(() => vi.unstubAllEnvs());

it("keeps the capture capability and child element stable across local renders and effect replay", async () => {
  const child = <output>Cart stays here</output>;
  const trees: ReturnType<typeof AnalyticsProvider>[] = [];
  const capabilities: ReturnType<typeof useAnalytics>[] = [];
  function Readout() {
    capabilities.push(useAnalytics());
    return child;
  }
  const readout = <Readout />;
  function Driver() {
    const [step, setStep] = useState(0);
    const tree = AnalyticsProvider({ children: readout });
    trees.push(tree);
    if (step === 0) setStep(1);
    return tree;
  }
  expect(renderToStaticMarkup(<Driver />)).toBe("<output>Cart stays here</output>");
  expect(probe.imports).not.toHaveBeenCalled();
  expect(trees[1].props.value).toBe(trees[0].props.value);
  expect(trees.every((tree) => tree.props.children === readout && tree.key === null)).toBe(true);
  const capability = capabilities[0]!;
  capability.capture("product_viewed", { productId: "shirt" });
  // Explicit setup replay, not a mounted StrictMode or remount-count test.
  probe.effects[0]();
  probe.effects[0]();
  await vi.waitFor(() => expect(probe.capture).toHaveBeenCalledTimes(1));
  expect(probe.imports).toHaveBeenCalledTimes(1);
  expect(probe.init).toHaveBeenCalledTimes(1);
  expect(trees[0].props.value).toBe(capability);
  capability.capture("checkout_started", { cartTotal: 10000 });
  expect(probe.capture).toHaveBeenCalledTimes(2);
});

it("renders children when disabled, with no SDK load", () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
  const child = <output>Available</output>;
  function Capture() {
    useAnalytics()?.capture("product_viewed", {});
    return child;
  }
  expect(
    renderToStaticMarkup(
      <AnalyticsProvider>
        <Capture />
      </AnalyticsProvider>,
    ),
  ).toBe("<output>Available</output>");
  for (const effect of probe.effects) effect();
  expect(probe.imports).not.toHaveBeenCalled();
  expect(probe.init).not.toHaveBeenCalled();
});

it("offers no capture capability outside its provider", () => {
  function Outside(): ReactNode {
    expect(useAnalytics()).toBeNull();
    return null;
  }
  renderToStaticMarkup(<Outside />);
});
