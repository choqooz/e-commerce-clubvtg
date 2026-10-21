import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = new URL("./storefront-motion.module.css", import.meta.url);
const mediaSurfaces = ".menuPanel[data-state],\n  .menuOverlay[data-state]";
const motionCss = () => {
  expect(existsSync(path), "Menu motion must live in its own scoped CSS module").toBe(true);
  return readFileSync(path, "utf8");
};
const rule = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`))?.[1];
  expect(body, `Missing rule: ${selector}`).toBeDefined();
  return body!;
};

// Stylesheet contracts only: Node/Vitest does not exercise CSS, Radix presence or focus.
describe("Mobile menu motion stylesheet", () => {
  const ease = "cubic-bezier(0.23, 1, 0.32, 1)";

  it("mirrors the cart slide to the left with distinct Radix presence names and no panel fade", () => {
    const css = motionCss();
    for (const [state, name, duration, from, to] of [
      ["open", "menuEnter", 250, "-100%", "0"],
      ["closed", "menuExit", 200, "0", "-100%"],
    ] as const) {
      const panel = rule(css, `.menuPanel[data-state="${state}"]`);
      expect(panel).toContain(`animation: ${name} ${duration}ms ${ease} both;`);
      expect(panel).not.toMatch(/filter|opacity/);
      const frames = css.slice(css.indexOf(`@keyframes ${name}`));
      expect(rule(frames, "from").trim()).toBe(`transform: translateX(${from});`);
      expect(rule(frames, "to").trim()).toBe(`transform: translateX(${to});`);
    }
    const menuCss = css.slice(0, css.indexOf("/* Cart motion"));
    expect(menuCss).not.toMatch(/scale|transition|:global|forceMount|will-change/);
  });

  it("fades only the menu backdrop with static 4px blur and cart-matched timing", () => {
    const css = motionCss();
    const overlay = rule(css, ".menuOverlay");
    expect(overlay).toContain("backdrop-filter: blur(4px);");
    expect(overlay).toContain("-webkit-backdrop-filter: blur(4px);");
    for (const [state, name, duration, from, to] of [
      ["open", "menuBackdropEnter", 250, 0, 1],
      ["closed", "menuBackdropExit", 200, 1, 0],
    ] as const) {
      expect(rule(css, `.menuOverlay[data-state="${state}"]`)).toContain(
        `animation: ${name} ${duration}ms ${ease} both;`,
      );
      const frames = css.slice(css.indexOf(`@keyframes ${name}`));
      expect(rule(frames, "from").trim()).toBe(`opacity: ${from};`);
      expect(rule(frames, "to").trim()).toBe(`opacity: ${to};`);
    }
    const menuCss = css.slice(0, css.indexOf("/* Cart motion"));
    expect(menuCss.match(/blur\(4px\)/g)).toHaveLength(2);
  });

  it("makes reduced motion immediate without changing the animation name during a live exit", () => {
    const css = motionCss();
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(rule(reduced, mediaSurfaces)).toMatch(/animation-duration:\s*0ms;/);
    const panel = rule(reduced, ".menuPanel[data-state]");
    expect(panel).toContain("transform: translateX(0) !important;");
    // Radix ignores end/cancel events whose name no longer matches computed animationName.
    // Keep the name so reducing motion mid-exit can still finish suspended presence.
    expect(rule(reduced, mediaSurfaces)).not.toMatch(/animation(?:-name)?:/);
    expect(panel).not.toMatch(/animation(?:-name)?:/);
    expect(css).not.toMatch(/animation(?:-name)?:\s*none/);
  });

  it("suppresses menu surfaces at the desktop breakpoint without global Sheet selectors", () => {
    const css = motionCss();
    const desktop = css.slice(css.indexOf("@media (min-width: 48rem)"));
    expect(css).toContain("@media (min-width: 48rem)");
    expect(rule(desktop, mediaSurfaces)).toMatch(/display:\s*none;/);
    expect(rule(desktop, mediaSurfaces)).toMatch(/animation-duration:\s*0ms;/);
    expect(rule(desktop, mediaSurfaces)).not.toMatch(/animation(?:-name)?:/);
    expect(desktop).not.toMatch(/data-slot|sheet-content|sheet-overlay|cart|dialog/);
  });
});

describe("Cart motion stylesheet", () => {
  const ease = "cubic-bezier(0.23, 1, 0.32, 1)";

  it("slides only the cart from the right and back with distinct Radix presence names", () => {
    const css = motionCss();
    expect(rule(css, '.cartPanel[data-state="open"]')).toContain(
      `animation: cartEnter 250ms ${ease} both;`,
    );
    expect(rule(css, '.cartPanel[data-state="closed"]')).toContain(
      `animation: cartExit 200ms ${ease} both;`,
    );
    for (const [name, from, to] of [
      ["cartEnter", "100%", "0"],
      ["cartExit", "0", "100%"],
    ]) {
      expect(css).toContain(`@keyframes ${name}`);
      const frames = css.slice(css.indexOf(`@keyframes ${name}`));
      expect(rule(frames, "from").trim()).toBe(`transform: translateX(${from});`);
      expect(rule(frames, "to").trim()).toBe(`transform: translateX(${to});`);
    }
    expect(css).not.toMatch(/:global|data-slot|forceMount|transition:|will-change/);
  });

  it("fades a static 4px backdrop blur without blurring the cart content", () => {
    const css = motionCss();
    const overlay = rule(css, ".cartOverlay");
    expect(overlay).toContain("backdrop-filter: blur(4px);");
    expect(overlay).toContain("-webkit-backdrop-filter: blur(4px);");
    for (const [state, name, duration, from, to] of [
      ["open", "cartBackdropEnter", 250, 0, 1],
      ["closed", "cartBackdropExit", 200, 1, 0],
    ] as const) {
      expect(rule(css, `.cartOverlay[data-state="${state}"]`)).toContain(
        `animation: ${name} ${duration}ms ${ease} both;`,
      );
      const frames = css.slice(css.indexOf(`@keyframes ${name}`));
      expect(rule(frames, "from").trim()).toBe(`opacity: ${from};`);
      expect(rule(frames, "to").trim()).toBe(`opacity: ${to};`);
    }
    expect(overlay.match(/blur\(4px\)/g)).toHaveLength(2);
    expect(rule(css, '.cartPanel[data-state="open"]')).not.toMatch(/filter|opacity/);
    expect(rule(css, '.cartPanel[data-state="closed"]')).not.toMatch(/filter|opacity/);
  });

  it("stops live reduced-motion translation and duration without losing presence names", () => {
    const css = motionCss();
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const panel = rule(reduced, ".cartPanel[data-state]");
    const overlay = rule(reduced, ".cartOverlay[data-state]");
    expect(panel).toContain("animation-duration: 0ms;");
    // Important overrides the transform keyframes, including a live suspended exit.
    expect(panel).toContain("transform: translateX(0) !important;");
    expect(overlay).toContain("animation-duration: 0ms;");
    for (const body of [panel, overlay]) expect(body).not.toMatch(/animation(?:-name)?:/);
    expect(css).not.toMatch(/animation(?:-name)?:\s*none/);
  });
});
