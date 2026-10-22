import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Providers } from "./providers";
import { AnalyticsProvider } from "@/contexts/analytics-context";
import { CartProvider } from "@/contexts/cart-context";

describe("Root provider structure", () => {
  it("always nests the same cart and children under the app-owned analytics provider", () => {
    const children = <output>Storefront</output>;
    const tree = Providers({ children });
    expect(tree.type).toBe(AnalyticsProvider);
    expect(tree.key).toBeNull();
    expect(tree.props.children.type).toBe(CartProvider);
    expect(tree.props.children.key).toBeNull();
    expect(tree.props.children.props.children).toBe(children);
  });

  it("keeps SDK runtime imports out of the root and all capture consumers", () => {
    for (const path of [
      "../app/providers.tsx",
      "../contexts/analytics-context.tsx",
      "../contexts/cart-context.tsx",
      "../components/product-detail-content.tsx",
      "../components/checkout-form.tsx",
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/from\s+["']posthog-js(?:\/[^"']*)?["']/);
    }
  });
});
