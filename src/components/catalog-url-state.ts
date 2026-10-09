import { CATEGORIES } from "@/lib/config";

// Tagged primitive snapshots separate stored names from view/legacy identifiers.
export type CatalogSnapshot = "home" | "all" | `type:${string}` | `legacy:${string}`;

export function normalizePublicTypeNames(values: readonly unknown[]): string[] {
  return [
    ...new Set(values.filter((name): name is string => typeof name === "string" && !!name.trim())),
  ];
}

export function isCatalogSelection(
  value: unknown,
  names: readonly string[],
): value is CatalogSnapshot {
  if (typeof value !== "string") return false;
  return (
    value === "home" ||
    value === "all" ||
    (value.startsWith("type:") && !!value.slice(5).trim() && names.includes(value.slice(5))) ||
    (value.startsWith("legacy:") &&
      !names.includes(value.slice(7)) &&
      CATEGORIES.some(({ id }) => id !== "all" && id === value.slice(7)))
  );
}

export function parseCatalogLocation(
  search: string,
  hash: string,
  names: readonly string[] = [],
): CatalogSnapshot {
  const params = new URLSearchParams(search);
  if (!params.has("category")) return hash === "#catalog" ? "all" : "home";
  const values = params.getAll("category");
  if (values.length !== 1 || !values[0].trim()) return "all";
  const name = values[0];
  if (names.includes(name)) return `type:${name}`;
  return CATEGORIES.some(({ id }) => id !== "all" && id === name) ? `legacy:${name}` : "all";
}

export function subscribeToCollection(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export const collectionSnapshot = (names: readonly string[] = []): CatalogSnapshot =>
  typeof window === "undefined"
    ? "home"
    : parseCatalogLocation(window.location.search, window.location.hash, names);
export const homeSnapshot = (): CatalogSnapshot => "home";

export function navigateCollection(category: string, names: readonly string[] = []) {
  if (!isCatalogSelection(category, names)) return;
  const params = new URLSearchParams(window.location.search);
  if (category === "home" || category === "all") params.delete("category");
  else params.set("category", category.slice(category.startsWith("type:") ? 5 : 7));
  const search = params.toString();
  let hash = window.location.hash;
  if (category !== "home") hash = "#catalog";
  else if (hash === "#catalog") hash = "";
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  // Native history keeps unrelated query state and lets Back restore category and view.
  window.history.pushState(null, "", next);
  window.dispatchEvent(new Event("hashchange"));
}
