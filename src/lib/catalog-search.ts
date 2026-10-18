import type { Product } from "@/lib/types";

export function searchProducts(products: Product[], query: string): Product[] {
  const term = query.trim().toLowerCase();
  if (!term) return products;
  return products.filter((product) =>
    [product.title, product.brand, product.description].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );
}

export const emptySearchSnapshot = (): string => "";
export const catalogSearchSnapshot = (): string =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("q") ?? "").trim();

export function catalogSearchHref(query: string, search = ""): string {
  const params = new URLSearchParams(search);
  const term = query.trim();
  if (term) params.set("q", term);
  else params.delete("q");
  const suffix = params.toString();
  return `/${suffix ? `?${suffix}` : ""}#catalog`;
}

export function navigateCatalogSearch(query: string) {
  // Keep category/foreign state only on the catalog route, never copy another page's params.
  const local = window.location.pathname === "/";
  const href = catalogSearchHref(query, local ? window.location.search : "");
  if (!local) {
    window.location.assign(href);
    return;
  }
  if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.pushState(null, "", href);
    // Share the existing collection subscription; pushState itself emits no event.
    window.dispatchEvent(new Event("hashchange"));
  }
}
