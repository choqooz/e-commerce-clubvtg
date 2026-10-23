import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const cells = ["promotions", "coupon"].flatMap((branch) =>
  [
    [1, 1],
    [10, 1],
    [50, 1],
    [1, 10],
    [1, 50],
  ].map(([n, m]) => ({ branch, n, m })),
);

export function summarize(cell, samples) {
  assert(
    cells.some((c) => c.branch === cell.branch && c.n === cell.n && c.m === cell.m),
    "Invalid axes",
  );
  assert.equal(samples.length, 33, "Require three warmups and thirty measured samples");
  const expected = {
    cancelled: cell.n,
    released: cell.n * cell.m,
    available: cell.n * cell.m,
    items: cell.n * cell.m,
    couponEvidence: cell.branch === "coupon" ? cell.n : 0,
    couponReservations: 0,
    usedCount: 0,
    authorizations: 0,
    identityUses: 0,
  };
  samples.forEach((sample, ordinal) => {
    assert.equal(sample.ordinal, ordinal, "Incomplete/reordered samples");
    assert(Number.isFinite(sample.ms) && sample.ms > 0, "Invalid server interval");
    assert.deepEqual(sample.work, expected, "Cancellation did not perform useful work");
  });
  const values = samples
    .slice(3)
    .map((sample) => sample.ms)
    .sort((a, b) => a - b);
  return {
    ...cell,
    count: values.length,
    median: (values[14] + values[15]) / 2,
    p95: values[28],
    min: values[0],
    max: values.at(-1),
    work: expected,
    warmupMs: samples.slice(0, 3).map((s) => s.ms),
    measuredMs: samples.slice(3).map((s) => s.ms),
  };
}

export function parseMode(args) {
  if (args.length)
    throw new Error(
      `Unsupported arguments: ${args.join(" ")}. This benchmark is baseline-only; ` +
        "--compare and --verify-candidate are retired. " +
        "Run: node scripts/sql-cancellation-benchmark.mjs",
    );
  return "baseline";
}

export function assertControl(metrics, repetitions) {
  const nested = metrics.filter(
    (r) => !r.toplevel && /^SELECT price from public\.products where id = product$/i.test(r.query),
  );
  assert.equal(
    nested.reduce((sum, r) => sum + r.calls, 0),
    repetitions,
    "Nested detector failed",
  );
  assert.equal(
    metrics.filter((r) => r.toplevel).reduce((sum, r) => sum + r.calls, 0),
    1,
  );
}

export async function assertContainerAbsent(
  lookup,
  pause = () => new Promise((done) => setTimeout(done, 100)),
) {
  // Docker stop can return before --rm finishes. Never remove an unowned resource.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await lookup()).trim()) return;
    if (attempt < 49) await pause();
  }
  assert.fail("Owned container remains");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const protectedPaths = [
  "scripts/run-database-tests.mjs",
  "scripts/database-test-suite-selection.mjs",
  "scripts/database-test-suite-selection.test.ts",
  "scripts/home-query-attribution.sql",
  "scripts/home-query-attribution.test.ts",
  "scripts/run-home-query-attribution.mjs",
  "src/app/home-query-attribution.test.tsx",
  "supabase/tests/database/036_expire_product_reservations_concurrency.test.sql",
  "scripts/database-test-support.sql",
];
const optionalTaskPaths = [
  "odd/tasks/sql-query-attribution.md",
  "odd/tasks/sql-reservation-expiry-batching.md",
];
const guardFilesystem = {
  read: (path) => readFile(path),
  list: async (path) =>
    (await readdir(path, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
    })),
};

export async function snapshotProtectedFiles(directory, io = guardFilesystem) {
  const digest = async (path) =>
    createHash("sha256")
      .update(await io.read(resolve(directory, path)))
      .digest("hex");
  async function optional(read) {
    try {
      return await read();
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async function files(path, entries) {
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const child = `${path}/${entry.name}`;
          return entry.directory ? files(child, await io.list(resolve(directory, child))) : child;
        }),
      )
    ).flat();
  }
  const migrations = (await io.list(resolve(directory, "supabase/migrations")))
    .map((entry) => entry.name)
    .filter((name) => /^\d.*\.sql$/.test(name));
  // Only these local roots may be absent. Nested reads and required inputs fail closed.
  const fontEntries = await optional(() => io.list(resolve(directory, "fonts")));
  const fontPaths = fontEntries === null ? [] : (await files("fonts", fontEntries)).sort();
  const paths = [
    ...protectedPaths,
    "scripts/sql-cancellation-benchmark-fixtures.sql",
    ...fontPaths,
    ...migrations.map((name) => `supabase/migrations/${name}`),
  ].sort();
  const manifest = Object.fromEntries(
    await Promise.all(paths.map(async (path) => [path, await digest(path)])),
  );
  for (const path of optionalTaskPaths) manifest[path] = await optional(() => digest(path));
  // The directory marker also distinguishes absent fonts from a newly created empty tree.
  manifest.fonts =
    fontEntries === null
      ? null
      : createHash("sha256").update(JSON.stringify(fontPaths)).digest("hex");
  return manifest;
}

async function main() {
  parseMode(process.argv.slice(2));
  const migrations = (await readdir(resolve(root, "supabase/migrations")))
    .filter((f) => /^\d.*\.sql$/.test(f))
    .sort();
  const before = await snapshotProtectedFiles(root);
  const name = `sql-cancellation-${randomUUID()}`;
  let owned = false;
  let stopping = false;
  const interrupt = () => {
    stopping = true;
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, interrupt);
  function docker(args, input = "") {
    return new Promise((done, fail) => {
      const child = spawn("docker", ["--host", "unix:///var/run/docker.sock", ...args], {
        cwd: root,
        env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
      });
      let output = "";
      let error = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("error", fail);
      child.stdin.on("error", fail);
      child.on("close", (code) =>
        code === 0 ? done(output) : fail(new Error(`docker exited ${code}: ${error}`)),
      );
      child.stdin.end(input);
    });
  }
  const sql = (db, input, variables = []) =>
    docker(
      [
        "exec",
        "-i",
        "-e",
        `PGOPTIONS=-c app.disposable_test=true -c statement_timeout=25000 -c app.disposable_dblink_connection=postgresql://postgres:disposable_benchmark_only@127.0.0.1:5432/${db}`,
        name,
        "psql",
        "-XAtq",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        db,
        ...variables,
      ],
      input,
    );
  const snapshot = `select coalesce(json_agg(s), '[]') from (select queryid::text, toplevel,
    calls, rows, total_exec_time, query from pg_stat_statements
    where dbid = (select oid from pg_database where datname = current_database())
    and query !~* '^set (local )?pg_stat_statements' order by queryid, toplevel) s`;
  try {
    const image = (await docker(["image", "inspect", "postgres:17", "--format", "{{.Id}}"])).trim();
    assert.equal((await docker(["ps", "-aq", "--filter", `name=^/${name}$`])).trim(), "");
    owned = true;
    await docker([
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "--label",
      `sql-cancellation=${name}`,
      "--network",
      "none",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_PASSWORD=disposable_benchmark_only",
      "-e",
      "POSTGRES_DB=bench_template",
      ...[
        ["supabase/migrations", "/migrations"],
        ["scripts/database-test-support.sql", "/support.sql"],
        ["scripts/sql-cancellation-benchmark-fixtures.sql", "/fixtures.sql"],
      ].flatMap(([source, target]) => [
        "--mount",
        `type=bind,source=${resolve(root, source)},target=${target},readonly`,
      ]),
      image,
      "-c",
      "shared_preload_libraries=pg_stat_statements",
      "-c",
      "pg_stat_statements.track=all",
    ]);
    let ready = false;
    for (let i = 0; i < 40 && !stopping; i++) {
      try {
        await sql("bench_template", "select 1;");
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 500));
      }
    }
    assert(ready && !stopping, "Disposable PostgreSQL readiness/interruption");
    await sql(
      "bench_template",
      "\\i /support.sql\n" +
        migrations.map((f) => `\\i /migrations/${f}`).join("\n") +
        "\ncreate extension pg_stat_statements;",
    );
    console.log(
      "PROTOCOL " +
        JSON.stringify({
          label: "synchronous direct SQL cancellation; not Home HTTP/PostgREST/production",
          name,
          image,
          migrations,
          migrationCount: migrations.length,
          seed: "sql-cancellation-v1:md5-sequential-products; checkout generates real UUIDs/timestamps",
          settings: JSON.parse(
            (
              await sql(
                "bench_template",
                `select jsonb_build_object('version', version(),
        'role', current_user, 'shared_preload_libraries', current_setting('shared_preload_libraries'),
        'pg_stat_statements.track', current_setting('pg_stat_statements.track'),
        'pg_stat_statements.max', current_setting('pg_stat_statements.max'), 'jit', current_setting('jit'),
        'synchronous_commit', current_setting('synchronous_commit'), 'statement_timeout', current_setting('statement_timeout'),
        'isolation', current_setting('transaction_isolation'), 'shared_buffers', current_setting('shared_buffers'),
        'work_mem', current_setting('work_mem'), 'compute_query_id', current_setting('compute_query_id'));`,
              )
            ).trim(),
          ),
          warmups: 3,
          measuredSamples: 30,
          percentiles: "median midpoint; p95 empirical nearest rank ceil(.95*30)",
          serverWindow:
            "clock_timestamp around only ordered cancel_product_order loop (includes loop/clock overhead)",
          wallWindow:
            "one docker exec/psql session per cell including process startup, fixture setup, assertions, fingerprints, rollbacks, representative counters and controls; NOT SQL latency",
          counterWindow:
            "reset before one representative cancellation after warm/measured batch; track=none outside cancellation wrapper",
          limits:
            "warm single-session local tmpfs PG17; default promotions branch without active campaign; fresh database per cell; committed checkout then 33 rollback transactions plus one representative; logical restoration not physical restoration; cache/plans/MVCC dead tuples persist; table stats approximate and include aborted DML, not exact bloat; row triggers can remain O(M); no contention/cold-cache/production claims",
        }),
    );
    const matrix = [];
    const shapes = {};
    for (const [index, cell] of cells.entries()) {
      assert(!stopping, "Interrupted");
      const db = `bench_${index}`;
      await sql("postgres", `create database ${db} template bench_template;`);
      const expectedWork = {
        cancelled: cell.n,
        released: cell.n * cell.m,
        available: cell.n * cell.m,
        items: cell.n * cell.m,
        couponEvidence: cell.branch === "coupon" ? cell.n : 0,
        couponReservations: 0,
        usedCount: 0,
        authorizations: 0,
        identityUses: 0,
      };
      const assertWork = `select bench.assert(bench.work() = '${JSON.stringify(expectedWork)}'::jsonb
        and (:'measurement'::jsonb->>'cancelled')::int = ${cell.n}, 'work_inside_transaction');`;
      const lines = [
        "\\i /fixtures.sql",
        "set pg_stat_statements.track = 'none';",
        "select array_agg(order_id order by order_id)::text as ids from bench.orders \\gset",
        "select bench.fingerprint() as baseline \\gset",
        "select jsonb_build_object('beforeStorage', (select json_agg(s) from (select relname, pg_relation_size(relid) as heap_bytes from pg_stat_user_tables where schemaname = 'public' and relname in ('orders', 'products', 'inventory_reservations') order by relname) s));",
      ];
      for (let ordinal = 0; ordinal < 33; ordinal++)
        lines.push(
          "select bench.assert(bench.fingerprint() = :'baseline', 'baseline_before');",
          "begin;",
          "set local pg_stat_statements.track = 'all';",
          "select bench.cancel(:'ids'::uuid[]) as measurement \\gset",
          "set local pg_stat_statements.track = 'none';",
          assertWork,
          `select jsonb_build_object('ordinal', ${ordinal}, 'ms', (:'measurement'::jsonb)->'ms',
          'cancelled', (:'measurement'::jsonb)->'cancelled', 'work', bench.work());`,
          "rollback;",
          "select bench.assert(bench.fingerprint() = :'baseline', 'rollback_baseline');",
        );
      // No fixture, assertion or snapshot SQL is included in the representative counters.
      lines.push(
        "select pg_stat_statements_reset();",
        "begin;",
        "set local pg_stat_statements.track = 'all';",
        "select bench.cancel(:'ids'::uuid[]) as measurement \\gset",
        "set local pg_stat_statements.track = 'none';",
        `select jsonb_build_object('representative', (${snapshot}));`,
        assertWork,
        "select jsonb_build_object('representativeWork', bench.work(), 'measurement', :'measurement'::jsonb);",
        "rollback;",
        "select bench.assert(bench.fingerprint() = :'baseline', 'representative_rollback');",
      );
      if (index === 0)
        for (const repeats of [1, 10, 50])
          lines.push(
            "select id::text as product from public.products order by id limit 1 \\gset",
            "select pg_stat_statements_reset();",
            "set pg_stat_statements.track = 'all';",
            `select bench.control(${repeats}, :'product'::uuid);`,
            "set pg_stat_statements.track = 'none';",
            `select jsonb_build_object('control', ${repeats}, 'metrics', (${snapshot}));`,
          );
      lines.push("select pg_stat_force_next_flush();");
      const start = performance.now();
      const output = await sql(db, lines.join("\n"), [
        "-v",
        `n=${cell.n}`,
        "-v",
        `m=${cell.m}`,
        "-v",
        `branch=${cell.branch}`,
      ]);
      const batchWallMs = performance.now() - start;
      const rows = output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      const samples = rows.filter((r) => "ordinal" in r);
      samples.forEach((s) => assert.equal(s.cancelled, cell.n, "No-op cancellation"));
      const result = summarize(cell, samples);
      const representative = rows.find((r) => r.representative).representative;
      const rep = rows.find((r) => r.representativeWork);
      assert.equal(rep.measurement.cancelled, cell.n);
      assert.deepEqual(rep.representativeWork, result.work);
      const compact = (metrics) =>
        metrics.map(({ query, ...metric }) => {
          shapes[metric.queryid] = query;
          return metric;
        });
      const controls = rows
        .filter((r) => "control" in r)
        .map((c) => {
          assertControl(c.metrics, c.control);
          return { repeats: c.control, metrics: compact(c.metrics) };
        });
      // Stats may lag within the measuring backend. Obtain a fresh observer after it exits.
      const tableStats = (
        await sql(
          db,
          "select coalesce(json_agg(s), '[]') from (select relname, n_live_tup, n_dead_tup, n_tup_upd, n_tup_del, pg_relation_size(relid) as heap_bytes from pg_stat_user_tables where schemaname='public' and (n_tup_upd > 0 or n_tup_del > 0) order by relname) s;",
        )
      ).trim();
      matrix.push({
        ...result,
        batchWallMs,
        representative: compact(representative),
        controls,
        beforeStorage: rows.find((r) => r.beforeStorage).beforeStorage,
        tableStats: JSON.parse(tableStats),
        nestedCalls: representative.filter((r) => !r.toplevel).reduce((sum, r) => sum + r.calls, 0),
        nestedShapes: representative.filter((r) => !r.toplevel).length,
      });
    }
    assert(!stopping, "Interrupted before completion");
    console.log("SHAPES " + JSON.stringify(shapes));
    console.log("MATRIX " + JSON.stringify(matrix));
    process.kill(process.pid, "SIGTERM");
    await new Promise((done) => setTimeout(done, 20));
    assert(stopping, "Signal handler self-check failed");
    console.log("SIGNAL_SELF_CHECK SIGTERM observed; shared finally cleanup follows");
  } finally {
    try {
      if (owned && (await docker(["ps", "-aq", "--filter", `name=^/${name}$`])).trim()) {
        assert.equal(
          (
            await docker([
              "inspect",
              "--format",
              '{{index .Config.Labels "sql-cancellation"}}',
              name,
            ])
          ).trim(),
          name,
        );
        await docker(["stop", "--time", "3", name]);
      }
      await assertContainerAbsent(() => docker(["ps", "-aq", "--filter", `name=^/${name}$`]));
      console.log(`CLEANED exact owned container absent: ${name}`);
    } finally {
      for (const signal of ["SIGINT", "SIGTERM"]) process.off(signal, interrupt);
      assert.deepEqual(await snapshotProtectedFiles(root), before, "Protected files changed");
      console.log(
        "PRESERVED_SHA256 " +
          JSON.stringify({
            count: Object.keys(before).length,
            optionalAbsent: [...optionalTaskPaths, "fonts"].filter((path) => before[path] === null),
            manifest: createHash("sha256").update(JSON.stringify(before)).digest("hex"),
            fixture: before["scripts/sql-cancellation-benchmark-fixtures.sql"],
            concurrency:
              before[
                "supabase/tests/database/036_expire_product_reservations_concurrency.test.sql"
              ],
          }),
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
