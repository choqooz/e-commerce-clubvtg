import { createClient as sdkClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { CatalogContent } from "@/components/catalog-content";
import { StorefrontTransition } from "@/components/storefront-transition";
import {
  assertSuccessfulCalls,
  localOrigin,
  observedFetch,
} from "../../scripts/run-home-query-attribution.mjs";
import HomePage from "./page";

// Only module boundaries are replaced. Home and its reservation helper run unchanged;
// every fluent query/RPC uses the real SDK and disposable PostgREST SQL engine.
const boundary = vi.hoisted(() => ({ client: vi.fn(), admin: {} as ReturnType<typeof sdkClient> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.client }));
vi.mock("@/lib/supabase/admin", () => ({
  get supabaseAdmin() {
    return boundary.admin;
  },
}));
vi.mock("@/components/catalog-content", () => ({ CatalogContent: () => null }));
vi.mock("@/components/storefront-transition", () => ({ StorefrontTransition: () => null }));

it.skipIf(!process.env.HOME_QUERY_ORIGIN)(
  "invokes Home with real local SQL, not a Next HTTP route",
  async () => {
    const origin = localOrigin(process.env.HOME_QUERY_ORIGIN!);
    const n = Number(process.env.HOME_QUERY_N);
    const expired = process.env.HOME_QUERY_EXPIRED === "true";
    expect([1, 10, 50]).toContain(n);
    const calls: { path: string; status: number; body: unknown }[] = [];
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: observedFetch(origin, calls) },
    };
    boundary.admin = sdkClient(origin, process.env.HOME_QUERY_ADMIN!, options);
    boundary.client.mockResolvedValue(sdkClient(origin, process.env.HOME_QUERY_ANON!, options));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const page = await HomePage();
      assertSuccessfulCalls(calls); // Home swallows backend failures; HTTP evidence cannot.
      expect(errors).not.toHaveBeenCalled();
      expect(calls.map((call) => call.path).sort()).toEqual([
        "/rest/v1/catalog_product_prices",
        "/rest/v1/product_types",
        "/rest/v1/rpc/expire_product_reservations",
      ]);
      expect(calls[0].path).toBe("/rest/v1/rpc/expire_product_reservations");
      expect(calls[0].body).toBe(expired ? n : 0);
      expect(page.type).toBe(StorefrontTransition);
      const catalog = page.props.children;
      expect(catalog.type).toBe(CatalogContent);
      expect(catalog.props.typesLoadError).toBe(false);
      expect(catalog.props.publicTypeNames).toContain("Synthetic Home");
      expect(catalog.props.initialProducts).toHaveLength(n);
      expect(
        new Set(catalog.props.initialProducts.map((product: { id: string }) => product.id)).size,
      ).toBe(n);
      for (const product of catalog.props.initialProducts) {
        expect(product).toMatchObject({
          status: "available",
          price: 100,
          current_price: 90,
          promotion_percent: 10,
        });
      }
      console.log(
        `HOME_HTTP ${JSON.stringify({
          n,
          expired,
          returnedProducts: catalog.props.initialProducts.length,
          calls: calls.map(({ path, status }) => ({ path, status })),
        })}`,
      );
    } finally {
      errors.mockRestore();
    }
  },
  30000,
);
