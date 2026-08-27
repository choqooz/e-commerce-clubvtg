import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config, PROTECTED_ROUTE_PATTERNS } from "./proxy";

function doesProxyMatch(url: string) {
  return unstable_doesProxyMatch({ config, url });
}

describe("Proxy configuration", () => {
  it.each(["/", "/sign-in", "/checkout", "/try-on", "/try-on/history", "/credits", "/profile", "/orders", "/admin/products"])(
    "runs for %s",
    (url) => {
      expect(doesProxyMatch(url)).toBe(true);
    },
  );

  it.each(["/_next/static/chunks/app.js", "/_next/image?url=%2Fcoat.jpg", "/favicon.ico", "/images/coat.webp", "/styles/site.css"])(
    "skips static asset path %s",
    (url) => {
      expect(doesProxyMatch(url)).toBe(false);
    },
  );

  it("keeps the protected route list immutable", () => {
    expect(PROTECTED_ROUTE_PATTERNS).toEqual([
      "/checkout",
      "/try-on(.*)",
      "/credits(.*)",
      "/profile(.*)",
      "/orders(.*)",
      "/admin(.*)",
    ]);
    expect(Object.isFrozen(PROTECTED_ROUTE_PATTERNS)).toBe(true);
  });
});
