import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/lib/config";
import {
  collectionSnapshot,
  homeSnapshot,
  navigateCollection,
  normalizePublicTypeNames,
  isCatalogSelection,
  parseCatalogLocation,
  subscribeToCollection,
} from "./catalog-url-state";

// In-memory URL/history and event callbacks, not a mounted browser or Next router.
function memoryWindow(initial = "/") {
  const events = new EventTarget();
  const entries = [new URL(initial, "https://store.example")];
  let index = 0;
  const location = { pathname: "", search: "", hash: "" };
  const sync = () =>
    Object.assign(location, {
      pathname: entries[index].pathname,
      search: entries[index].search,
      hash: entries[index].hash,
    });
  sync();
  const pushState = vi.fn((_state: unknown, _title: string, url: string) => {
    entries.splice(index + 1);
    entries.push(new URL(url, entries[index]));
    index++;
    sync();
  });
  const move = (offset: number) => {
    index += offset;
    sync();
    events.dispatchEvent(new Event("popstate"));
  };
  vi.stubGlobal("window", {
    location,
    history: { pushState },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  return { location, entries, pushState, events, back: () => move(-1), forward: () => move(1) };
}

afterEach(() => vi.unstubAllGlobals());

describe("Public taxonomy URL state", () => {
  const names = [
    "ropa única 👕",
    "all",
    "home",
    "__proto__",
    "constructor",
    "toString",
    "type:all",
    "legacy:tops",
    "tops",
    "  Lino  ",
  ];

  it("normalizes only nonblank string values, preserving exact stored spelling and Unicode", () => {
    const input = [null, undefined, {}, 1, "", " ", ...names, "all", "All", "Ropa Única 👕"];
    const before = JSON.stringify(input);
    expect(normalizePublicTypeNames(input)).toEqual([...names, "All", "Ropa Única 👕"]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(names)(
    "prioritizes the actual public name %s, including legacy/reserved/prefix collisions",
    (name) => {
      const search = `?category=${encodeURIComponent(name)}`;
      expect(parseCatalogLocation(search, "", names)).toBe(`type:${name}`);
      expect(parseCatalogLocation(search, "#other", names)).toBe(`type:${name}`);
      expect(parseCatalogLocation(search, "#catalog", [])).toBe(
        name === "tops" ? "legacy:tops" : "all",
      );
    },
  );

  it.each(["unknown", "", " ", "Ropa única 👕", "type:ropa única 👕"])(
    "rejects unknown/empty/injected URL names: %s",
    (name) => {
      expect(parseCatalogLocation(`?category=${encodeURIComponent(name)}`, "", names)).toBe("all");
    },
  );

  it("rejects repeated categories even when both names are valid, and distinguishes a loaded empty list", () => {
    expect(parseCatalogLocation("?category=all&category=all", "", names)).toBe("all");
    expect(parseCatalogLocation("?category=tops", "", [])).toBe("legacy:tops");
    expect(parseCatalogLocation("?category=tops", "", ["tops"])).toBe("type:tops");
    expect(parseCatalogLocation("", "#catalog", names)).toBe("all");
    expect(parseCatalogLocation("", "", names)).toBe("home");
  });

  it("writes raw stored names, retains unrelated parameters, restores history and keeps Todo unambiguous", () => {
    const browser = memoryWindow("/shop?tag=one&tag=two&keep=1#details");
    const onChange = vi.fn(() => collectionSnapshot(names));
    const cleanup = subscribeToCollection(onChange);
    for (const name of names) {
      navigateCollection(`type:${name}`, names);
      expect(new URLSearchParams(browser.location.search).get("category")).toBe(name);
      expect(collectionSnapshot(names)).toBe(`type:${name}`);
      navigateCollection(`type:${name}`, names);
    }
    expect(browser.pushState).toHaveBeenCalledTimes(names.length);
    navigateCollection("all", names);
    expect(new URLSearchParams(browser.location.search).has("category")).toBe(false);
    expect(collectionSnapshot(names)).toBe("all");
    browser.back();
    expect(collectionSnapshot(names)).toBe("type:  Lino  ");
    browser.forward();
    expect(collectionSnapshot(names)).toBe("all");
    navigateCollection("home", names);
    expect(browser.location).toEqual({
      pathname: "/shop",
      search: "?tag=one&tag=two&keep=1",
      hash: "",
    });
    browser.back();
    expect(collectionSnapshot(names)).toBe("all");
    browser.forward();
    expect(collectionSnapshot(names)).toBe("home");
    cleanup();
    expect(onChange).toHaveBeenCalledTimes(names.length + 6);
  });

  it.each([
    "unknown",
    "tops",
    "type:missing",
    "type:",
    "type: ",
    "legacy:all",
    "legacy:home",
    "legacy:tops",
    "legacy:constructor",
  ])("rejects injected or stale selection %s without history/events", (selection) => {
    const browser = memoryWindow("/?keep=1#catalog");
    expect(isCatalogSelection(selection, names)).toBe(false);
    navigateCollection(selection, names);
    expect(browser.pushState).not.toHaveBeenCalled();
    expect(browser.location.search).toBe("?keep=1");
  });

  it("rejects non-string injected state and revalidates names on each primitive snapshot", () => {
    memoryWindow("/?category=ropa%20%C3%BAnica%20%F0%9F%91%95");
    expect(isCatalogSelection(null, names)).toBe(false);
    expect(isCatalogSelection({ kind: "type", name: "all" }, names)).toBe(false);
    expect(collectionSnapshot(names)).toBe("type:ropa única 👕");
    expect(collectionSnapshot([])).toBe("all");
    expect(collectionSnapshot(names)).toBe(collectionSnapshot(names));
  });
});

describe("Catalog URL state", () => {
  it.each(CATEGORIES)("opens configured $id directly without a fragment", ({ id }) => {
    const expected = id === "all" ? "all" : `legacy:${id}`;
    expect(parseCatalogLocation(`?category=${id}`, "")).toBe(expected);
    expect(parseCatalogLocation(`?keep=1&category=${id}`, "#other")).toBe(expected);
  });

  it.each([
    "",
    "unknown",
    "hombre",
    "__proto__",
    "constructor",
    "toString",
    "TOPS",
    " tops",
    "%",
    "%E0%A4%A",
    "ropa%20%C3%BAnica",
    "%F0%9F%91%95",
    "tops&category=bottoms",
  ])("falls back to all for empty, malformed or unconfigured values: %s", (value) => {
    expect(parseCatalogLocation(`?category=${value}`, "")).toBe("all");
    expect(parseCatalogLocation(`?category=${value}`, "#catalog")).toBe("all");
  });

  it("decodes query values, recognizes only the exact legacy fragment, and keeps SSR home", () => {
    expect(parseCatalogLocation("?category=%74%6f%70%73", "")).toBe("legacy:tops");
    expect(parseCatalogLocation("?Category=tops", "")).toBe("home");
    expect(parseCatalogLocation("?keep=1", "#catalog")).toBe("all");
    expect(parseCatalogLocation("", "#other")).toBe("home");
    expect(parseCatalogLocation("", "#Catalog")).toBe("home");
    expect(parseCatalogLocation("", "")).toBe("home");
    vi.stubGlobal("window", undefined);
    expect(homeSnapshot()).toBe("home");
    expect(collectionSnapshot()).toBe("home");
  });

  it("provides stable primitive snapshots and unsubscribes both event callbacks", () => {
    const browser = memoryWindow("/?category=tops");
    const onChange = vi.fn(() => collectionSnapshot());
    const cleanup = subscribeToCollection(onChange);
    expect(collectionSnapshot()).toBe(collectionSnapshot());
    browser.location.search = "?category=bottoms";
    browser.events.dispatchEvent(new Event("popstate"));
    expect(onChange.mock.results[0].value).toBe("legacy:bottoms");
    browser.location.search = "";
    browser.location.hash = "#catalog";
    browser.events.dispatchEvent(new Event("hashchange"));
    expect(onChange.mock.results[1].value).toBe("all");
    cleanup();
    browser.events.dispatchEvent(new Event("popstate"));
    browser.events.dispatchEvent(new Event("hashchange"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("writes each configured selection with catalog hash and avoids duplicate entries", () => {
    const browser = memoryWindow("/shop?tag=one&tag=two&search=ropa%20%C3%BAnica#other");
    const onChange = vi.fn();
    const cleanup = subscribeToCollection(onChange);
    for (const { id } of CATEGORIES) {
      const selection = id === "all" ? "all" : `legacy:${id}`;
      navigateCollection(selection);
      expect(collectionSnapshot()).toBe(selection);
      expect(browser.location.pathname).toBe("/shop");
      expect(browser.location.hash).toBe("#catalog");
      const params = new URLSearchParams(browser.location.search);
      expect(params.get("category")).toBe(id === "all" ? null : id);
      expect(params.getAll("tag")).toEqual(["one", "two"]);
      expect(params.get("search")).toBe("ropa única");
      navigateCollection(selection);
    }
    expect(browser.pushState).toHaveBeenCalledTimes(CATEGORIES.length);
    expect(onChange).toHaveBeenCalledTimes(CATEGORIES.length);
    cleanup();
  });

  it("return home deletes only category/catalog hash and Back/Forward restores category/view", () => {
    const browser = memoryWindow("/?keep=1&category=tops");
    navigateCollection("legacy:bottoms");
    navigateCollection("home");
    expect(browser.location).toEqual({ pathname: "/", search: "?keep=1", hash: "" });
    expect(collectionSnapshot()).toBe("home");
    navigateCollection("home");
    expect(browser.pushState).toHaveBeenCalledTimes(2);
    browser.back();
    expect(collectionSnapshot()).toBe("legacy:bottoms");
    browser.back();
    expect(collectionSnapshot()).toBe("legacy:tops");
    browser.forward();
    expect(collectionSnapshot()).toBe("legacy:bottoms");
    browser.forward();
    expect(collectionSnapshot()).toBe("home");
  });

  it("keeps unrelated fragments on return home and removes even invalid duplicate categories", () => {
    const browser = memoryWindow("/shop?category=__proto__&category=tops&keep=1#details");
    navigateCollection("home");
    expect(browser.location).toEqual({ pathname: "/shop", search: "?keep=1", hash: "#details" });
    expect(collectionSnapshot()).toBe("home");
    browser.back();
    expect(collectionSnapshot()).toBe("all");
  });
});
