import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

// All backend boundaries are mocked before importing HomePage. No SSR client,
// reservation service, environment credentials or network request runs here.
const backend = vi.hoisted(() => ({
  events: [] as unknown[][],
  products: [] as unknown[] | null,
  types: [] as unknown[] | null,
  error: null as unknown,
  rejection: false,
  release: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/components/catalog-content", () => ({ CatalogContent: () => null }));
vi.mock("@/lib/supabase/release-reservations", () => ({
  releaseExpiredReservations: backend.release,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: backend.client }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(backend, { events: [], products: [], types: [], error: null, rejection: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden in fixture tests");
    }),
  );
  backend.release.mockImplementation(async () => {
    backend.events.push(["release"]);
  });
  backend.client.mockImplementation(async () => {
    backend.events.push(["client"]);
    return {
      from(table: string) {
        backend.events.push(["from", table]);
        return {
          select(columns: string) {
            backend.events.push(["select", columns]);
            if (table === "catalog_product_prices") {
              expect(columns).toBe("*");
              return {
                eq(column: string, value: string) {
                  backend.events.push(["eq", column, value]);
                  return {
                    async order(column: string, options: unknown) {
                      backend.events.push(["order", column, options]);
                      return { data: backend.products };
                    },
                  };
                },
              };
            }
            expect(table).toBe("product_types");
            expect(columns).toBe("name");
            return {
              async order(column: string) {
                backend.events.push(["order", column]);
                if (backend.rejection) throw new Error("Private transport detail");
                // Model the actual projection, not a mock returning private columns.
                const data = backend.types?.map((row) =>
                  row && typeof row === "object" ? { name: (row as { name?: unknown }).name } : row,
                );
                return { data, error: backend.error };
              },
            };
          },
        };
      },
    };
  });
});
afterEach(() => vi.unstubAllGlobals());

const expectedChain = [
  ["release"],
  ["client"],
  ["from", "catalog_product_prices"],
  ["select", "*"],
  ["eq", "status", "available"],
  ["order", "created_at", { ascending: false }],
  ["from", "product_types"],
  ["select", "name"],
  ["order", "name"],
];

describe("Home public taxonomy boundary (fully mocked)", () => {
  it("preserves reservation/product chain and reads only ordered names with the same anon SSR client", async () => {
    backend.products = [{ id: "priced-fixture", category: "Camisas", current_price: 0 }];
    backend.types = [
      { name: "Camisas", id: "private-id", is_active: true },
      { name: "Sin prendas", created_at: "private-date" },
      { name: "ropa única 👕" },
      { name: "all" },
      { name: "home" },
      { name: "__proto__" },
      { name: "  Lino  " },
      { name: "Camisas" },
      { name: "" },
      { name: "  " },
      { name: null },
      { name: 42 },
      {},
      null,
    ];
    const before = JSON.stringify({ products: backend.products, types: backend.types });
    const tree = await HomePage();
    expect(backend.events).toEqual(expectedChain);
    expect(backend.release).toHaveBeenCalledOnce();
    expect(backend.client).toHaveBeenCalledOnce();
    expect(tree.props).toEqual({
      initialProducts: backend.products,
      publicTypeNames: [
        "Camisas",
        "Sin prendas",
        "ropa única 👕",
        "all",
        "home",
        "__proto__",
        "  Lino  ",
        "Camisas",
      ],
      typesLoadError: false,
    });
    expect(JSON.stringify(tree.props)).not.toMatch(/private-id|private-date|is_active|created_at/);
    expect(JSON.stringify({ products: backend.products, types: backend.types })).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[], null, [{ name: null }, { name: "" }, { name: " " }, { name: 0 }]])(
    "passes an honest empty list without product-derived or static fallback: %j",
    async (rows) => {
      backend.types = rows;
      backend.products = null;
      expect((await HomePage()).props).toEqual({
        initialProducts: [],
        publicTypeNames: [],
        typesLoadError: false,
      });
      expect(backend.events).toEqual(expectedChain);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "sanitizes returned/thrown taxonomy errors without dropping products: %s",
    async (throws) => {
      backend.products = [{ id: "retained-product" }];
      backend.types = [{ name: "Do not use partial errored data" }];
      backend.error = { message: "Private database detail", code: "42501", hint: "private table" };
      backend.rejection = throws;
      const tree = await HomePage();
      expect(tree.props).toEqual({
        initialProducts: backend.products,
        publicTypeNames: [],
        typesLoadError: true,
      });
      expect(JSON.stringify(tree.props)).not.toMatch(/Private|42501|private table|partial/);
      expect(backend.events).toEqual(expectedChain);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

// G1 identity rules: exact literal/template contents, JSX whitespace folding,
// type-only imports and declaration flags. No whole-function exclusion.
function jsxCopy(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line, index) => {
      let copy = line.replace(/\t/g, " ");
      if (index !== 0) copy = copy.replace(/^ +/, "");
      if (index !== lines.length - 1) copy = copy.replace(/ +$/, "");
      return copy;
    })
    .filter(Boolean)
    .join(" ");
}
function semantic(node: ts.Node): unknown {
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    if (!ts.isJsxText(child) || jsxCopy(child.text)) children.push(semantic(child));
  });
  const literal =
    ts.isIdentifier(node) ||
    ts.isLiteralExpression(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node);
  return [
    node.kind,
    ts.isJsxText(node) ? jsxCopy(node.text) : literal ? node.text : null,
    ts.isVariableDeclarationList(node) ? node.flags & ts.NodeFlags.BlockScoped : null,
    "isTypeOnly" in node ? node.isTypeOnly : null,
    children,
  ];
}
const parse = (text: string) =>
  ts.createSourceFile("surface.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const identity = (node: ts.Node) => JSON.stringify(semantic(node));
const source = () => readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
function serverPreservationHash(text: string) {
  const file = parse(text);
  const page = file.statements[4];
  if (
    file.statements.length !== 5 ||
    !ts.isFunctionDeclaration(page) ||
    page.name?.text !== "HomePage" ||
    !page.body ||
    page.body.statements.length !== 7
  )
    return null;
  const additions = parse(`
    let publicTypeNames: string[] = [];
    let typesLoadError = false;
    try {
      const { data: types, error } = await supabase.from("product_types").select("name").order("name");
      typesLoadError = Boolean(error);
      if (!error && Array.isArray(types)) {
        publicTypeNames = types.flatMap((row) => typeof row?.name === "string" && row.name.trim() ? [row.name] : []);
      }
    } catch { typesLoadError = true; }
    return (<CatalogContent initialProducts={products || []} publicTypeNames={publicTypeNames} typesLoadError={typesLoadError} />);
  `).statements;
  for (let index = 0; index < additions.length; index++)
    if (identity(page.body.statements[index + 3]) !== identity(additions[index])) return null;
  // Exact adjacent slots after the existing reservation/client/product statements.
  text =
    text.slice(0, page.body.statements[3].getStart(file)) +
    "return <CatalogContent initialProducts={products || []} />;" +
    text.slice(page.body.statements[6].getEnd());
  return createHash("sha256")
    .update(identity(parse(text)))
    .digest("hex");
}

describe("Strict server preservation from actual parent pre-T1 copy", () => {
  // /tmp/taxonomy-breadcrumb-parent-1p_y41rl/files/src/app/page.tsx, not HEAD/current.
  const expected = "3f2758cc9329e370722f0e9b4c3fcc79968a9419e46bd312f37dbd488326bd6a";
  it("permits only the exact names query/normalization/error/serialized props at fixed slots", () => {
    expect(serverPreservationHash(source())).toBe(expected);
    expect(serverPreservationHash(source().replace(/\n  /g, "\n    "))).toBe(expected);
  });

  it.each([
    ['.select("name")', '.select("*")'],
    ['.order("name")', '.eq("is_active", true).order("name")'],
    ['.from("product_types")', '.from("product_subtypes")'],
    ['.order("created_at", { ascending: false })', '.order("created_at", { ascending: true })'],
    ['.eq("status", "available")', '.eq("status", "sold")'],
    ["await releaseExpiredReservations();", "void releaseExpiredReservations();"],
    ["@/lib/supabase/server", "@/lib/supabase/admin"],
    ["initialProducts={products || []}", "initialProducts={[]}"],
    ["publicTypeNames={publicTypeNames}", "publicTypeNames={types}"],
    ["typesLoadError={typesLoadError}", "typesLoadError={error}"],
    ["[row.name] : []", "[row.name.trim()] : []"],
    ["Boolean(error)", "false"],
    ["catch {", "catch (error) { console.error(error);"],
    ['.select("name")', '.select("name").select("name")'],
  ])("rejects query/projection/business/private-data mutation %s", (before, after) => {
    const text = source();
    expect(text).toContain(before);
    const mutation = text.replace(before, after);
    expect(mutation).not.toBe(text);
    expect(serverPreservationHash(mutation)).not.toBe(expected);
  });

  it.each([false, true])(
    "rejects duplicate/moved names queries and reordered business statements (compact chains: %s)",
    (compact) => {
      const text = compact
        ? source().replace(/\n\s+(?=\.(?:from|select|order)\()/g, " ")
        : source();
      expect(serverPreservationHash(text)).toBe(expected);
      const file = parse(text);
      const page = file.statements[4] as ts.FunctionDeclaration;
      const tryBlock = page.body!.statements[5] as ts.TryStatement;
      expect(ts.isTryStatement(tryBlock)).toBe(true);
      const query = tryBlock.tryBlock.statements[0];
      expect(ts.isVariableStatement(query)).toBe(true);
      const approvedQuery = parse(
        'const { data: types, error } = await supabase.from("product_types").select("name").order("name");',
      ).statements[0];
      expect(identity(query)).toBe(identity(approvedQuery));
      const start = query.getStart(file);
      const end = query.getEnd();
      const queryText = text.slice(start, end);
      const clientEnd = page.body!.statements[1].getEnd();
      const moved =
        text.slice(0, clientEnd) +
        `\n${queryText}` +
        text.slice(clientEnd, start) +
        text.slice(end);
      const duplicated = text.slice(0, end) + `\n${queryText}` + text.slice(end);
      const reordered = text
        .replace("await releaseExpiredReservations();", "")
        .replace(
          "let publicTypeNames: string[] = [];",
          "await releaseExpiredReservations(); let publicTypeNames: string[] = [];",
        );
      const queryCounts = (candidate: string) => {
        const root = parse(candidate).statements[4] as ts.FunctionDeclaration;
        let total = 0;
        let inTry = 0;
        const visit = (node: ts.Node, insideTry = false) => {
          if (ts.isVariableStatement(node) && identity(node) === identity(approvedQuery)) {
            total++;
            if (insideTry) inTry++;
          }
          ts.forEachChild(node, (child) =>
            visit(child, insideTry || (ts.isTryStatement(node) && child === node.tryBlock)),
          );
        };
        visit(root);
        return { total, inTry };
      };
      expect(queryCounts(text)).toEqual({ total: 1, inTry: 1 });
      expect(queryCounts(moved)).toEqual({ total: 1, inTry: 0 });
      expect(queryCounts(duplicated)).toEqual({ total: 2, inTry: 2 });
      expect(queryCounts(reordered)).toEqual({ total: 1, inTry: 1 });
      for (const mutation of [moved, duplicated, reordered]) {
        expect(mutation).not.toBe(text);
        expect(serverPreservationHash(mutation)).not.toBe(expected);
      }
    },
  );
});
