import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/types";

// Persistent shallow hooks and real URL subscriptions. No DOM/provider/app is mounted.
const hooks = vi.hoisted(() => ({
  owner: "header",
  index: 0,
  refIndex: 0,
  changed: false,
  states: {} as Record<string, unknown[]>,
  refs: {} as Record<string, { current: unknown }[]>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const states = (hooks.states[hooks.owner] ??= []);
    const index = hooks.index++;
    if (index >= states.length) states[index] = initial;
    return [
      states[index],
      (value: unknown) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
        hooks.changed = true;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const refs = (hooks.refs[hooks.owner] ??= []);
    const index = hooks.refIndex++;
    return refs[index] ?? (refs[index] = { current: initial });
  },
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false }),
  useClerk: () => ({}),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => null,
}));
vi.mock("@/contexts/cart-context", () => ({
  useCart: () => ({ totalItems: 0, setIsOpen: vi.fn() }),
}));
vi.mock("@/lib/actions/credits", () => ({ getUserCredits: vi.fn() }));
vi.mock("@/components/cart-drawer", () => ({ CartDrawer: () => null }));
import { CatalogContent } from "./catalog-content";
import { CollectionEditorial } from "./collection-editorial";
import { CatalogFilters, EMPTY_FILTERS } from "./catalog-filters";
import { navigateCollection, subscribeToCollection } from "./catalog-url-state";
import { ProductCard } from "./product-card";
import { SiteHeader } from "./site-header";
import { navigateCatalogSearch } from "@/lib/catalog-search";

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
const descendants = (tree: ReactNode): Element[] =>
  Children.toArray(tree).flatMap((child) =>
    isValidElement(child)
      ? [
          child as Element,
          ...descendants(
            child.type === CollectionEditorial
              ? CollectionEditorial(child.props as Parameters<typeof CollectionEditorial>[0])
              : (child as Element).props.children,
          ),
        ]
      : [],
  );
const elements = (tree: ReactNode, type: unknown) =>
  descendants(tree).filter((node) => node.type === type);
const namedButton = (tree: ReactNode, name: string) =>
  elements(tree, "button").find((node) => node.props["aria-label"] === name)!;
const click = (node: Element) => (node.props.onClick as () => void)();
const input = (tree: ReactNode) => elements(tree, "input")[0];
const type = (tree: ReactNode, value: string) =>
  (input(tree).props.onChange as (event: unknown) => void)({ target: { value } });
const submit = (tree: ReactNode) => {
  const preventDefault = vi.fn();
  (elements(tree, "form")[0].props.onSubmit as (event: unknown) => void)({
    preventDefault,
    currentTarget: { elements: { namedItem: () => ({ value: input(tree).props.value }) } },
  });
  expect(preventDefault).toHaveBeenCalledOnce();
};
function render(owner: string, component: () => ReactNode): ReactNode {
  hooks.owner = owner;
  for (let retry = 0; retry < 5; retry++) {
    hooks.index = hooks.refIndex = 0;
    hooks.changed = false;
    const tree = component();
    if (!hooks.changed) return tree;
  }
  throw new Error("Shallow hook state did not settle");
}
const header = () => render("header", SiteHeader);
const product: Product = {
  id: "linen",
  slug: "linen",
  title: "Camisa de lino",
  brand: "Original",
  description: null,
  category: "tops",
  subcategory: "camisas",
  size: "M",
  color: "Azul",
  condition: "Bueno",
  price: 10000,
  image_urls: [],
  status: "available",
  reserved_at: null,
  measurements: null,
  created_at: "",
  updated_at: "",
  product_type_id: null,
  product_subtype_id: null,
};
const products = [
  product,
  { ...product, id: "cotton", title: "Camisa de algodón" },
  { ...product, id: "small", size: "S" },
  { ...product, id: "bottom", category: "bottoms" },
];
const catalog = () =>
  render("catalog", () =>
    CatalogContent({ initialProducts: products, publicTypeNames: ["tops", "bottoms"] }),
  );
const cardIds = (tree: ReactNode) =>
  elements(tree, ProductCard).map((card) => (card.props.product as Product).id);

function browser(initial: string) {
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
  vi.stubGlobal("window", {
    location,
    history: { pushState },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  const move = (offset: number) => {
    index += offset;
    sync();
    events.dispatchEvent(new Event("popstate"));
  };
  return { location, pushState, back: () => move(-1), forward: () => move(1) };
}

beforeEach(() => {
  hooks.states = { header: [true, false, null, 0] };
  hooks.refs = {};
});
afterEach(() => vi.unstubAllGlobals());

describe("Single in-field search controls", () => {
  it("keeps a named search form, one icon submit and one icon clear inside the field wrapper", () => {
    browser("/?q=lino#catalog");
    const tree = header();
    const form = elements(tree, "form")[0];
    expect(form.props).toMatchObject({
      role: "search",
      "aria-label": "Buscar prendas",
      method: "get",
      action: "/#catalog",
    });
    const field = elements(form, "div")[0];
    expect(field.props.className).toContain("relative");
    expect(input(field).props).toMatchObject({
      type: "search",
      name: "q",
      value: "lino",
      "aria-label": "Buscar prendas",
    });
    const originalInput = input(field);
    navigateCatalogSearch("algodón");
    expect(input(header()).key).toBe(originalInput.key); // No query-based remount/autofocus.
    expect(input(header()).props.ref).toBe(originalInput.props.ref);
    const buttons = elements(field, "button");
    expect(buttons).toHaveLength(2);
    expect(namedButton(field, "Buscar prendas").props.type).toBe("submit");
    expect(namedButton(field, "Limpiar búsqueda").props.type).toBe("button");
    for (const button of buttons) {
      const markup = renderToStaticMarkup(<>{button.props.children}</>);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup.replace(/<[^>]*>/g, "")).toBe("");
      expect(button.props.className).toContain("focus-visible:outline-2");
    }
    expect(input(field).props.className).toContain(
      "[&::-webkit-search-cancel-button]:appearance-none",
    );
    expect(input(field).props.className).toContain("focus-visible:outline-2");
  });

  it("does not apply drafts live, and clears a draft-only query without adding duplicate history", () => {
    const page = browser("/?category=tops&keep=1#catalog");
    let tree = header();
    expect(namedButton(tree, "Limpiar búsqueda")).toBeUndefined();
    type(tree, "lino");
    tree = header();
    expect(input(tree).props.value).toBe("lino");
    expect(page.location.search).toBe("?category=tops&keep=1");
    const focus = vi.fn();
    (input(tree).props.ref as { current: unknown }).current = { focus };
    click(namedButton(tree, "Limpiar búsqueda"));
    tree = header();
    expect(input(tree).props.value).toBe("");
    expect(namedButton(tree, "Limpiar búsqueda")).toBeUndefined();
    expect(page.pushState).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("submits the draft through the form, then clears both query/results while retaining every filter and foreign param", () => {
    const page = browser("/?category=tops&tag=one&tag=two&keep=1#catalog");
    const filters = {
      ...EMPTY_FILTERS,
      sizes: ["M"],
      subcategory: "camisas",
      brands: ["Original"],
      colors: ["azul"],
      conditions: ["Bueno"],
      priceBracket: 0,
    };
    hooks.states.catalog = ["type:tops", filters];
    let tree = header();
    let results = catalog();
    const cleanup = subscribeToCollection(() => {
      tree = header();
      results = catalog();
    });
    expect(cardIds(results)).toEqual(["linen", "cotton"]);
    type(tree, "  lino  ");
    tree = header();
    expect(cardIds(catalog())).toEqual(["linen", "cotton"]);
    submit(tree); // Enter and the magnifier share this native form submit handler.
    expect(input(tree).props.value).toBe("lino");
    expect(cardIds(results)).toEqual(["linen"]);
    expect(namedButton(results, "Limpiar búsqueda")).toBeUndefined();
    expect(
      elements(results, "button").some((node) => node.props.children === "Limpiar búsqueda"),
    ).toBe(false);
    const status = elements(results, "span").find((node) => node.props.role === "status")!;
    expect(renderToStaticMarkup(<>{status.props.children}</>)).toContain(
      "1 prenda encontrada para “lino”",
    );
    type(tree, "algodón");
    tree = header();
    const focus = vi.fn();
    (input(tree).props.ref as { current: unknown }).current = { focus };
    click(namedButton(tree, "Limpiar búsqueda"));
    expect(input(tree).props.value).toBe("");
    expect(focus).toHaveBeenCalledOnce();
    expect(cardIds(results)).toEqual(["linen", "cotton"]);
    expect(elements(results, CatalogFilters)[0].props.filters).toBe(filters);
    expect(page.location.search).toBe("?category=tops&tag=one&tag=two&keep=1");
    expect(page.pushState).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it.each(["", "   "])(
    "commits an empty/blank draft %j instead of leaving the applied q active",
    (value) => {
      const page = browser("/?category=tops&q=lino#catalog");
      let tree = header();
      type(tree, value);
      tree = header();
      expect(namedButton(tree, "Limpiar búsqueda")).toBeDefined();
      expect(page.location.search).toContain("q=lino");
      submit(tree);
      tree = header();
      expect(page.location.search).toBe("?category=tops");
      expect(input(tree).props.value).toBe("");
      expect(namedButton(tree, "Limpiar búsqueda")).toBeUndefined();
    },
  );

  it("keeps X available with an empty draft but an applied q, and recovers empty results", () => {
    const page = browser("/?category=tops&q=missing#catalog");
    let tree = header();
    expect(cardIds(catalog())).toEqual([]);
    type(tree, "");
    tree = header();
    click(namedButton(tree, "Limpiar búsqueda"));
    expect(input(header()).props.value).toBe("");
    expect(page.location.search).toBe("?category=tops");
    expect(cardIds(catalog())).toEqual(["linen", "cotton", "small"]);
  });

  it("restores applied queries and results on Back/Forward without resurrecting any abandoned draft", () => {
    const page = browser("/?category=tops&q=lino&keep=1#catalog");
    let tree = header();
    let results = catalog();
    const cleanup = subscribeToCollection(() => {
      tree = header();
      results = catalog();
    });
    type(tree, "algodón");
    tree = header();
    submit(tree);
    expect(cardIds(results)).toEqual(["cotton"]);
    type(tree, "stale draft");
    tree = header();
    page.back();
    expect(input(tree).props.value).toBe("lino");
    expect(cardIds(results)).toEqual(["linen", "small"]);
    type(tree, "another stale draft");
    tree = header();
    page.forward();
    expect(input(tree).props.value).toBe("algodón");
    click(namedButton(tree, "Limpiar búsqueda"));
    expect(input(tree).props.value).toBe("");
    page.back();
    expect(input(tree).props.value).toBe("algodón");
    page.forward();
    expect(input(tree).props.value).toBe("");
    expect(cardIds(results)).toEqual(["linen", "cotton", "small"]);
    expect(page.location.search).toBe("?category=tops&keep=1");
    cleanup();
  });

  it("retains an unapplied draft on category-only changes and syncs URL query changes while collapsed", () => {
    browser("/?category=tops&q=lino#catalog");
    let tree = header();
    type(tree, "draft");
    navigateCollection("type:bottoms", ["tops", "bottoms"]);
    tree = header();
    expect(input(tree).props.value).toBe("draft");
    click(namedButton(tree, "Buscar"));
    expect(elements(header(), "form")).toHaveLength(0);
    navigateCatalogSearch("algodón");
    tree = header();
    click(namedButton(tree, "Buscar"));
    tree = header();
    expect(input(tree).props.value).toBe("algodón");
  });
});
