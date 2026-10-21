import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogSearchHref,
  catalogSearchSnapshot,
  emptySearchSnapshot,
  navigateCatalogSearch,
  searchProducts,
} from "./catalog-search";
import type { Product } from "./types";

const product: Product = {
  id: "one",
  slug: "camisa",
  title: "Camisa vintage",
  brand: "Original",
  description: "Lino natural",
  category: "tops",
  size: "M",
  color: "Azul",
  price: 10000,
  image_urls: [],
  status: "available",
  reserved_at: null,
  created_at: "",
  updated_at: "",
  subcategory: null,
  condition: null,
  measurements: null,
  product_type_id: null,
  product_subtype_id: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("Catalog search", () => {
  it.each(["  CAMISA  ", "original", "LINO NATURAL"])(
    "matches title/brand/description: %s",
    (query) => {
      const products = [product, { ...product, title: "Otro", brand: null, description: null }];
      const before = JSON.stringify(products);
      expect(searchProducts(products, query)).toEqual([product]);
      expect(JSON.stringify(products)).toBe(before);
    },
  );

  it("keeps blank queries unfiltered and does not match unrelated fields or treat input as regex", () => {
    const products = [product];
    expect(searchProducts(products, " \n ")).toBe(products);
    for (const query of ["tops", "Azul", ".*", "sin coincidencias"])
      expect(searchProducts(products, query)).toEqual([]);
    expect(searchProducts([], "camisa")).toEqual([]);
  });

  it("encodes query text and clears only q, preserving category and repeated foreign parameters", () => {
    const search = "?category=tops&tag=one&tag=two&q=old";
    const href = catalogSearchHref("  lino & algodón 👕  ", search);
    const url = new URL(href, "https://store.example");
    expect(url.hash).toBe("#catalog");
    expect(url.searchParams.get("q")).toBe("lino & algodón 👕");
    expect(url.searchParams.get("category")).toBe("tops");
    expect(url.searchParams.getAll("tag")).toEqual(["one", "two"]);
    expect(catalogSearchHref(" ", search)).toBe("/?category=tops&tag=one&tag=two#catalog");
    expect(catalogSearchHref("")).toBe("/#catalog");
  });

  it("provides hydration-safe snapshots and normalizes a URL query", () => {
    vi.stubGlobal("window", undefined);
    expect(catalogSearchSnapshot()).toBe("");
    expect(emptySearchSnapshot()).toBe("");
    vi.stubGlobal("window", { location: { search: "?q=%20Lino%20" } });
    expect(catalogSearchSnapshot()).toBe("Lino");
  });

  it("keeps a rapid clear intent while the previous native search capture is pending", () => {
    const location = { pathname: "/", search: "", hash: "#catalog" };
    const callbacks: (() => void)[] = [];
    const skipTransition = vi.fn();
    const finished = Promise.resolve();
    vi.stubGlobal("CSS", { supports: () => true });
    const pushState = vi.fn((_state, _title, href: string) => {
      const url = new URL(href, "https://store.example");
      Object.assign(location, { search: url.search, hash: url.hash });
    });
    vi.stubGlobal("window", {
      location,
      history: { pushState },
      dispatchEvent: vi.fn(),
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal("document", {
      querySelector: () => ({}),
      startViewTransition: ({ update }: { update: () => void }) => {
        callbacks.push(update);
        return { skipTransition, finished, ready: finished, updateCallbackDone: finished };
      },
    });
    navigateCatalogSearch("lino");
    navigateCatalogSearch("");
    callbacks.forEach((callback) => callback());
    expect(catalogSearchSnapshot()).toBe("");
    expect(skipTransition).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledTimes(2);
  });

  it("uses native history locally, avoids duplicate entries and strips other-page parameters", () => {
    const location = {
      pathname: "/",
      search: "?category=tops&keep=1",
      hash: "#catalog",
      assign: vi.fn(),
    };
    const pushState = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { location, history: { pushState }, dispatchEvent });
    navigateCatalogSearch("  lino  ");
    expect(pushState).toHaveBeenCalledWith(null, "", "/?category=tops&keep=1&q=lino#catalog");
    expect(dispatchEvent.mock.calls[0][0].type).toBe("hashchange");
    location.search += "&q=lino";
    navigateCatalogSearch("lino");
    expect(pushState).toHaveBeenCalledOnce();
    Object.assign(location, { pathname: "/orders", search: "?page=2&keep=private" });
    navigateCatalogSearch("camisa");
    expect(location.assign).toHaveBeenCalledWith("/?q=camisa#catalog");
    expect(pushState).toHaveBeenCalledOnce();
  });
});
