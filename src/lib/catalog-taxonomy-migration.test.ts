import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const matches = readdirSync(migrationsDir).filter((file) =>
  /^\d{14}_public_catalog_type_names\.sql$/.test(file),
);
if (matches.length !== 1) {
  throw new Error("Expected exactly one CLI-generated public_catalog_type_names migration");
}
// Read the actual generated migration once; no copied SQL fixture is the authority.
const migration = readFileSync(join(migrationsDir, matches[0]), "utf8");
const runtimeProof = readFileSync(
  join(process.cwd(), "supabase/tests/database/public_catalog_type_names.test.sql"),
  "utf8",
);
const historicalProof = readFileSync(
  join(process.cwd(), "supabase/tests/database/023_taxonomy.test.sql"),
  "utf8",
);
const runner = readFileSync(join(process.cwd(), "scripts/run-database-tests.mjs"), "utf8");

function withoutLineComments(source: string) {
  return source.replace(/^\s*--[^\n]*$/gm, "").trim();
}

// Closed textual contract for this small permission-only migration, NOT a SQL parser
// or a PostgreSQL privilege proof. Unknown statements fail closed. No DB is contacted.
function assertNamesOnlyContract(source: string) {
  const sql = withoutLineComments(source).toLowerCase();
  expect(sql.endsWith(";")).toBe(true);
  const statements = sql
    .split(";")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  expect(statements).toEqual([
    "begin",
    "revoke all privileges on table public.product_types from public, anon, authenticated",
    "grant select (name) on table public.product_types to anon, authenticated",
    "drop policy if exists public_catalog_type_names on public.product_types",
    "create policy public_catalog_type_names on public.product_types for select to anon, authenticated using (is_active = true)",
    "commit",
  ]);
}

const denialCases = [
  "private_id_read_denied",
  "private_timestamp_read_denied",
  "private_activity_read_denied",
  "full_row_read_denied",
  "private_activity_filter_denied",
  "subtype_name_read_denied",
  "subtype_full_row_read_denied",
  "type_insert_denied",
  "type_update_denied",
  "type_delete_denied",
  "subtype_insert_denied",
  "subtype_update_denied",
  "subtype_delete_denied",
  "create_type_rpc_denied",
  "create_subtype_rpc_denied",
  "set_active_rpc_denied",
];

function assertRuntimeProofCoverage(source: string) {
  const sql = withoutLineComments(source);
  expect(sql).toContain("disposable_database_guard_required");
  expect(sql).toContain("select pg_temp.assert_visible_names('anon')");
  expect(sql).toContain("select pg_temp.assert_visible_names('authenticated')");
  expect(sql).toContain("(values ('anon'), ('authenticated')) as roles(role_name)");
  for (const caseName of denialCases) expect(sql).toContain(`'${caseName}'`);
  for (const caseName of [
    "active_empty_type_fixture_must_have_zero_products",
    "_active_empty_type_name_missing",
    "_inactive_type_name_exposed",
    "_active_master_names_mismatch",
    "no_public_whole_table_privileges",
    "only_name_column_select_allowed",
    "role_limited_select_policy_and_rls_retained",
    "admin_service_function_grants_retained",
    "admin_service_deactivation_contract_retained",
    "products_and_history_unchanged",
  ]) {
    expect(sql).toContain(`'${caseName}'`);
  }
  expect(sql).toContain("exception when insufficient_privilege then null");
  expect(sql).toContain("has_column_privilege");
  expect(sql).toContain("has_function_privilege('service_role', signature, 'EXECUTE')");
  expect(sql).toContain("has_function_privilege('postgres', signature, 'EXECUTE')");
  expect(sql).toContain("'invalid_taxonomy_kind'");
  expect(sql).toContain("'taxonomy_not_found'");
  expect(sql).toMatch(/rollback;\s*$/);
}

function parseRunner(source: string) {
  // Parse bytes only. Importing this runner would start disposable containers.
  return ts.createSourceFile("runner.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

function runnerNodeShape(node: ts.Node): unknown {
  // Compare syntax and literal values, not trivia, comments or trailing commas.
  const children: unknown[] = [];
  node.forEachChild((child) => {
    children.push(runnerNodeShape(child));
  });
  const text =
    ts.isIdentifier(node) ||
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
      ? node.text
      : undefined;
  return [node.kind, text, children];
}

function assertRunnerNode(node: ts.Node, expectedStatement: string) {
  expect(runnerNodeShape(node)).toEqual(
    runnerNodeShape(parseRunner(expectedStatement).statements[0]),
  );
}

function runnerVariable(statements: readonly ts.Statement[], name: string) {
  const matches = statements
    .filter(ts.isVariableStatement)
    .filter((statement) =>
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      ),
    );
  expect(matches).toHaveLength(1);
  expect(matches[0].declarationList.declarations).toHaveLength(1);
  return matches[0];
}

function runnerPhase(statements: readonly ts.Statement[], phase: string) {
  const matches = statements
    .filter(ts.isIfStatement)
    .filter(
      (statement) =>
        JSON.stringify(runnerNodeShape(statement.expression)) ===
        JSON.stringify(
          runnerNodeShape(
            (parseRunner(`if (phase === "${phase}") {}`).statements[0] as ts.IfStatement)
              .expression,
          ),
        ),
    );
  expect(matches).toHaveLength(1);
  return matches[0];
}

function runnerPhaseNodes(source: string) {
  const parsed = parseRunner(source);
  const suites = runnerVariable(parsed.statements, "suites").declarationList.declarations[0]
    .initializer;
  if (!suites || !ts.isArrayLiteralExpression(suites)) throw new Error("Missing suite array");
  const functions = parsed.statements
    .filter(ts.isFunctionDeclaration)
    .filter((node) => node.name?.text === "runSuite");
  expect(functions).toHaveLength(1);
  const body = functions[0].body;
  if (!body) throw new Error("Missing runSuite body");
  const tries = body.statements.filter(ts.isTryStatement);
  expect(tries).toHaveLength(1);
  const statements = tries[0].tryBlock.statements;
  const loops = statements.filter(ts.isForOfStatement);
  expect(loops).toHaveLength(1);
  return {
    suites,
    body: body.statements,
    statements,
    application: loops[0],
    taxonomy: runnerPhase(statements, "taxonomy"),
    publicNames: runnerPhase(statements, "public_catalog_type_names"),
    finalProof: runnerVariable(statements, "output"),
  };
}

function assertRunnerPhases(source: string) {
  const { suites, body, statements, application, taxonomy, publicNames, finalProof } =
    runnerPhaseNodes(source);
  for (const [name, registration] of [
    ["023_taxonomy", '["023_taxonomy", 23, "taxonomy"]'],
    [
      "public_catalog_type_names",
      '["public_catalog_type_names", "_public_catalog_type_names.sql", "public_catalog_type_names"]',
    ],
  ]) {
    expect(
      suites.elements.filter(
        (node) =>
          ts.isArrayLiteralExpression(node) &&
          ts.isStringLiteral(node.elements[0]) &&
          node.elements[0].text === name,
      ),
    ).toHaveLength(1);
    const expected = (
      parseRunner(`const suite = ${registration};`).statements[0] as ts.VariableStatement
    ).declarationList.declarations[0].initializer!;
    expect(
      suites.elements.filter(
        (node) =>
          JSON.stringify(runnerNodeShape(node)) === JSON.stringify(runnerNodeShape(expected)),
      ),
    ).toHaveLength(1);
  }
  assertRunnerNode(body[0], "const [name, migrationCutoff, phase] = suite;");
  assertRunnerNode(
    runnerVariable(body, "matches"),
    `const matches = typeof migrationCutoff === "string"
    ? migrationFiles.filter(({ file }) => file.endsWith(migrationCutoff)) : [];`,
  );
  assertRunnerNode(
    body[2],
    `if (typeof migrationCutoff === "string" && matches.length !== 1) {
    throw new Error(\`expected exactly one migration for \${migrationCutoff}\`);
  }`,
  );
  assertRunnerNode(
    runnerVariable(body, "maxMigration"),
    'const maxMigration = typeof migrationCutoff === "string" ? matches[0].number : migrationCutoff;',
  );
  expect(body.indexOf(runnerVariable(body, "matches"))).toBe(1);
  expect(body.indexOf(runnerVariable(body, "maxMigration"))).toBe(3);
  assertRunnerNode(
    application,
    `for (const migration of migrationFiles.filter(
    ({ number }) => number <= maxMigration && (phase !== "taxonomy" || number < maxMigration)
  )) await psql(container, migration.file);`,
  );
  assertRunnerNode(
    taxonomy,
    `if (phase === "taxonomy") {
    await psql(container, \`/workspace/supabase/tests/database/\${name}.test.sql\`, { pre_taxonomy: "1" });
    await psql(container, \`/workspace/supabase/migrations/023_scheduled_promotions_foundation.sql\`);
  }`,
  );
  assertRunnerNode(
    publicNames,
    `if (phase === "public_catalog_type_names") {
    await psql(container, \`/workspace/supabase/tests/database/\${name}.test.sql\`);
    await psql(container, matches[0].file);
  }`,
  );
  assertRunnerNode(
    finalProof,
    `const output = await psql(container,
    \`/workspace/supabase/tests/database/\${name}.test.sql\`, phase === "retention" ? { retention: true } : {});`,
  );
  expect(statements.indexOf(taxonomy)).toBeGreaterThan(statements.indexOf(application));
  expect(statements.indexOf(publicNames)).toBeGreaterThan(statements.indexOf(taxonomy));
  expect(statements.indexOf(finalProof)).toBe(statements.indexOf(publicNames) + 1);
  assertRunnerNode(statements[statements.indexOf(finalProof) + 1], "return { name, output };");
}

function replaceRunnerNode(source: string, node: ts.Node, replacement: string) {
  return source.slice(0, node.getStart()) + replacement + source.slice(node.end);
}

describe("Prepared public catalog type names migration (offline contracts only)", () => {
  it("allows only transactional, repeatable name SELECT and active role-scoped RLS", () => {
    assertNamesOnlyContract(migration);
  });

  it("documents preparation and a names-only policy/grant rollback", () => {
    expect(migration).toContain("Prepared only");
    expect(migration).toContain(
      "Rollback (reference only; do not execute without separate authorization)",
    );
    expect(migration).toContain(
      "-- drop policy if exists public_catalog_type_names on public.product_types;",
    );
    expect(migration).toContain(
      "-- revoke select (name) on table public.product_types from anon, authenticated;",
    );
  });

  it.each([
    ["whole-row SELECT", "select (name)", "select"],
    ["private column grant", "select (name)", "select (name, id, created_at, is_active)"],
    ["service-role grant", "to anon, authenticated;", "to anon, authenticated, service_role;"],
    ["PUBLIC grant", "to anon, authenticated;", "to public;"],
    ["inactive rows", "is_active = true", "is_active = false"],
    ["all rows", "is_active = true", "true"],
    ["unscoped policy", "for select to anon, authenticated", "for select"],
    ["PUBLIC policy", "for select to anon, authenticated", "for select to public"],
    ["write policy", "for select to anon, authenticated", "for all to anon, authenticated"],
    [
      "RLS disable",
      "commit;",
      "alter table public.product_types disable row level security; commit;",
    ],
    [
      "subtype access",
      "commit;",
      "grant select (name) on public.product_subtypes to anon; commit;",
    ],
    [
      "mutation grant",
      "commit;",
      "grant update (name) on public.product_types to authenticated; commit;",
    ],
    [
      "RPC grant",
      "commit;",
      "grant execute on function public.create_product_taxonomy_type(text) to anon; commit;",
    ],
    [
      "service bypass",
      "commit;",
      "create function public.bypass() returns boolean language sql security definer as 'select true'; commit;",
    ],
    [
      "schema change",
      "commit;",
      "alter table public.product_types add column exposed text; commit;",
    ],
    [
      "product insert",
      "commit;",
      "insert into public.products (title) values ('Changed'); commit;",
    ],
    ["product update", "commit;", "update public.products set category = 'Changed'; commit;"],
    ["product delete", "commit;", "delete from public.products; commit;"],
    ["taxonomy data", "commit;", "update public.product_types set is_active = true; commit;"],
    [
      "authority revoke",
      "from public, anon, authenticated;",
      "from public, anon, authenticated, service_role;",
    ],
  ])("rejects negative fixture: %s", (_caseName, before, after) => {
    expect(migration).toContain(before);
    const changed = migration.replace(before, after);
    expect(changed).not.toBe(migration);
    expect(() => assertNamesOnlyContract(changed)).toThrow();
  });

  it("authors both-role allow/deny and retained admin proofs without claiming SQL execution", () => {
    assertRuntimeProofCoverage(runtimeProof);
    const missingDenial = runtimeProof.replace("'private_id_read_denied'", "'missing'");
    expect(() => assertRuntimeProofCoverage(missingDenial)).toThrow();
  });

  it("accepts the formatted runner and equivalent compact phase statements without execution", () => {
    assertRunnerPhases(runner);
    const printer = ts.createPrinter({
      removeComments: true,
      newLine: ts.NewLineKind.CarriageReturnLineFeed,
    });
    let compact = printer.printFile(parseRunner(runner));
    for (const key of ["taxonomy", "publicNames", "finalProof"] as const) {
      const node = runnerPhaseNodes(compact)[key];
      const statement = printer
        .printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
        .replace(/\r?\n\s*/g, " ");
      compact = replaceRunnerNode(compact, node, statement);
    }
    expect(compact).not.toBe(runner);
    expect(compact).toContain('pre_taxonomy: "1"');
    assertRunnerPhases(compact);
  });

  it.each([
    "remove fixture flag",
    "change fixture value",
    "invert phase order",
    "remove first proof",
    "remove reapply",
    "remove final proof",
    "ambiguous suffix resolver",
    "wrong foundation migration",
    "wrong proof query scope",
    "include taxonomy foundation too early",
  ])("rejects runner phase negative fixture: %s", (caseName) => {
    const nodes = runnerPhaseNodes(runner);
    let changed: string;
    switch (caseName) {
      case "remove fixture flag":
        changed = replaceRunnerNode(
          runner,
          nodes.taxonomy,
          nodes.taxonomy.getText().replace(/pre_taxonomy\s*:\s*"1"\s*,?/, ""),
        );
        break;
      case "change fixture value":
        changed = replaceRunnerNode(
          runner,
          nodes.taxonomy,
          nodes.taxonomy.getText().replace(/pre_taxonomy\s*:\s*"1"/, 'pre_taxonomy: "0"'),
        );
        break;
      case "invert phase order":
        changed =
          runner.slice(0, nodes.taxonomy.getStart()) +
          nodes.publicNames.getText() +
          runner.slice(nodes.taxonomy.end, nodes.publicNames.getStart()) +
          nodes.taxonomy.getText() +
          runner.slice(nodes.publicNames.end);
        break;
      case "remove first proof":
      case "remove reapply": {
        const phase = nodes.publicNames.thenStatement;
        if (!ts.isBlock(phase)) throw new Error("Missing public-name phase block");
        changed = replaceRunnerNode(
          runner,
          phase.statements[caseName === "remove first proof" ? 0 : 1],
          "",
        );
        break;
      }
      case "remove final proof":
        changed = replaceRunnerNode(runner, nodes.finalProof, "const output = 'proof missing';");
        break;
      case "ambiguous suffix resolver":
        changed = runner.replace("matches.length !== 1", "matches.length < 1");
        break;
      case "wrong foundation migration":
        changed = replaceRunnerNode(
          runner,
          nodes.taxonomy,
          nodes.taxonomy
            .getText()
            .replace("023_scheduled_promotions_foundation.sql", "022_activate_clerk_lifecycle.sql"),
        );
        break;
      case "wrong proof query scope":
        changed = replaceRunnerNode(
          runner,
          nodes.publicNames,
          nodes.publicNames
            .getText()
            .replace("/workspace/supabase/tests/database/", "/workspace/supabase/migrations/"),
        );
        break;
      case "include taxonomy foundation too early":
        changed = replaceRunnerNode(
          runner,
          nodes.application,
          nodes.application.getText().replace("number < maxMigration", "number <= maxMigration"),
        );
        break;
      default:
        throw new Error(`Unknown negative fixture: ${caseName}`);
    }
    expect(changed).not.toBe(runner);
    expect(() => assertRunnerPhases(changed)).toThrow();
  });

  it("keeps historical SQL023 before the new migration and repeats postmigration proofs", () => {
    assertRunnerPhases(runner);
    const obsoleteCutoff = runner.replace(
      '["023_taxonomy", 23, "taxonomy"]',
      '["023_taxonomy", Infinity]',
    );
    const missingReplay = runner.replace(
      "await psql(container, matches[0].file)",
      "/* replay missing */",
    );
    expect(() => assertRunnerPhases(obsoleteCutoff)).toThrow();
    expect(() => assertRunnerPhases(missingReplay)).toThrow();
    expect(historicalProof).toContain("anon_taxonomy_read_allowed");
    expect(historicalProof).toContain("mismatched_type_subtype_pair_allowed");
    expect(historicalProof).toContain("referenced_subtype_delete_allowed");
    expect(historicalProof).toContain("set role service_role");
  });
});
