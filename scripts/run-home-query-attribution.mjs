import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function statementDeltas(before, after) {
  const key = (row) => `${row.queryid}:${row.toplevel}:${row.userid}`;
  return after
    .map((row) => ({
      ...row,
      calls: row.calls - (before.find((old) => key(old) === key(row))?.calls ?? 0),
    }))
    .filter((row) => row.calls > 0);
}

export function localOrigin(value) {
  try {
    const url = new URL(value);
    assert(url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port);
    assert(url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash);
    return url.origin;
  } catch (cause) {
    throw new Error("Expected an explicit disposable loopback origin", { cause });
  }
}

function parseJSON(value) {
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new Error("Invalid disposable runtime JSON evidence", { cause });
  }
}

export function observedFetch(origin, calls, transport = fetch) {
  localOrigin(origin);
  return async (input, init = {}) => {
    let url;
    try {
      url = new URL(typeof input === "string" ? input : (input.url ?? input.href));
    } catch (cause) {
      throw new Error("Invalid experiment request URL", { cause });
    }
    assert.equal(url.origin, origin, "Remote requests are forbidden");
    assert(url.pathname.startsWith("/rest/v1/"));
    const call = { path: url.pathname, status: 0, body: null };
    calls.push(call);
    // PostgREST has no Supabase gateway prefix. Redirects must never escape loopback.
    url.pathname = url.pathname.slice("/rest/v1".length);
    const response = await transport(url, { ...init, redirect: "error" });
    call.status = response.status;
    call.body = await response.clone().json();
    return response;
  };
}

export function assertSuccessfulCalls(calls) {
  assert(calls.length > 0, "No HTTP evidence");
  for (const call of calls)
    assert(call.status >= 200 && call.status < 300, `HTTP failure: ${call.path}`);
}

// Dedicated config avoids dotenv, config bundling and disk caches during this experiment.
const vitestConfig = {
  envDir: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", cache: false },
};
export default vitestConfig;

const root = fileURLToPath(new URL("../", import.meta.url));
const secret = "disposable-home-only-dummy-jwt-secret-not-for-production";
const password = "disposable_home_only";
const label = `home-attribution-${randomUUID()}`;
const pg = `${label}-pg`;
const rest = `${label}-rest`;
const owned = new Set();
let networkCreated = false;
let stopping = false;
let signalSelfCheck = false;

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      ...options,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolveRun(output) : reject(new Error(`${command} failed (${code}): ${output}`)),
    );
  });
}
const docker = (...args) => run("docker", args);
const sql = (db, ...args) =>
  docker(
    "exec",
    "-e",
    "PGOPTIONS=-c app.disposable_test=true",
    pg,
    "psql",
    "-XAtq",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    db,
    ...args,
  );
const delay = () => new Promise((done) => setTimeout(done, 1100));

async function waitFor(check, checkInterruption = true) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (checkInterruption && stopping) throw new Error("Interrupted");
    try {
      await check();
      return;
    } catch {
      await delay();
    }
  }
  throw new Error("Disposable service readiness timed out");
}

async function cleanup() {
  const failures = [];
  // Continue attempting all owned resources even if one cleanup fails.
  for (const name of [...owned].reverse()) {
    try {
      await docker("stop", "--time", "3", name);
      await waitFor(
        async () =>
          assert.equal((await docker("ps", "-aq", "--filter", `name=^/${name}$`)).trim(), ""),
        false,
      );
      owned.delete(name);
      console.log(`CLEANED container ${name}`);
    } catch (error) {
      failures.push(error);
    }
  }
  if (networkCreated) {
    try {
      await docker("network", "rm", label);
      assert.equal((await docker("network", "ls", "-q", "--filter", `name=^${label}$`)).trim(), "");
      networkCreated = false;
      console.log(`CLEANED network ${label}`);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `Cleanup failed: ${label}`);
}

function token(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

async function snapshot(db) {
  // pg_stat_statements counters update at statement completion; backend-local
  // cumulative stats have a separate flush interval. Wait equally for every run.
  await delay();
  return parseJSON(
    (
      await sql(
        db,
        "-c",
        `select coalesce(json_agg(s), '[]') from (
    select queryid::text, userid, toplevel, calls::int, rows::int, query
    from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
    and query !~ 'pg_stat_statements' and query ~ '(public[".]|catalog_product_prices|expire_product_reservations|cancel_product_order|home_probe)'
    order by queryid, toplevel, userid) s`,
      )
    ).trim(),
  );
}

async function main() {
  await docker("image", "inspect", "postgres:17", "--format", "{{.Id}}").catch(() =>
    docker("pull", "postgres:17"),
  );
  // v16.1 is evidenced by the installed local Supabase PostgREST image inventory.
  const image = "postgrest/postgrest:v16.1";
  await docker("image", "inspect", image, "--format", "{{.Id}}").catch(() => docker("pull", image));
  // Dedicated bridge: Docker 29 internal networks suppressed published ports.
  // No pre-existing network is joined; only REST is published, on loopback.
  await docker(
    "network",
    "create",
    "--driver",
    "bridge",
    "--label",
    `home-attribution=${label}`,
    label,
  );
  networkCreated = true;
  await docker(
    "run",
    "--rm",
    "-d",
    "--name",
    pg,
    "--network",
    label,
    "--label",
    `home-attribution=${label}`,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    "POSTGRES_DB=home_template",
    "-v",
    `${resolve(root, "supabase/migrations")}:/migrations:ro`,
    "-v",
    `${resolve(root, "scripts/database-test-support.sql")}:/support.sql:ro`,
    "-v",
    `${resolve(root, "scripts/home-query-attribution.sql")}:/fixtures.sql:ro`,
    "postgres:17",
    "-c",
    "shared_preload_libraries=pg_stat_statements",
    "-c",
    "pg_stat_statements.track=all",
  );
  owned.add(pg);
  await waitFor(() => sql("home_template", "-c", "select 1"));
  await sql("home_template", "-f", "/support.sql");
  const migrations = (await readdir(resolve(root, "supabase/migrations")))
    .filter((file) => /^\d.*\.sql$/.test(file))
    .sort();
  for (const file of migrations) await sql("home_template", "-f", `/migrations/${file}`);
  await sql("home_template", "-c", "create extension pg_stat_statements");
  console.log(
    JSON.stringify({
      migrations,
      postgres: (await sql("home_template", "-c", "show server_version")).trim(),
      postgrestImage: image,
    }),
  );
  const matrix = [];
  for (const axis of ["catalog", "expired"])
    for (const n of [1, 10, 50]) {
      if (stopping) throw new Error("Interrupted");
      const db = `home_${axis}_${n}`;
      await sql("postgres", "-c", `create database ${db} template home_template`);
      await sql(db, "-v", `n=${n}`, "-v", `expired=${axis === "expired"}`, "-f", "/fixtures.sql");
      await docker(
        "run",
        "--rm",
        "-d",
        "--name",
        rest,
        "--network",
        label,
        "--label",
        `home-attribution=${label}`,
        "-p",
        "127.0.0.1::3000",
        "-e",
        `PGRST_DB_URI=postgres://postgres:${password}@${pg}:5432/${db}`,
        "-e",
        "PGRST_DB_ANON_ROLE=anon",
        "-e",
        `PGRST_JWT_SECRET=${secret}`,
        image,
      );
      owned.add(rest);
      const bindings = parseJSON(
        await docker(
          "inspect",
          "--format",
          '{{json (index .NetworkSettings.Ports "3000/tcp")}}',
          rest,
        ),
      );
      assert(bindings?.length, `Missing loopback port binding: ${await docker("logs", rest)}`);
      const binding = bindings[0];
      assert.equal(binding.HostIp, "127.0.0.1");
      const origin = localOrigin(`http://127.0.0.1:${binding.HostPort}`);
      await waitFor(async () =>
        assert.equal((await fetch(origin, { redirect: "error" })).status, 200),
      );
      console.log(`CREATED ${db} ${origin} ${pg} ${rest}`);
      await sql(db, "-c", "select pg_stat_statements_reset()");
      const before = await snapshot(db);
      const output = await run(
        process.execPath,
        [
          "node_modules/vitest/vitest.mjs",
          "run",
          "src/app/home-query-attribution.test.tsx",
          "--config",
          "scripts/run-home-query-attribution.mjs",
          "--configLoader",
          "runner",
          "--reporter",
          "verbose",
        ],
        {
          env: {
            PATH: process.env.PATH,
            HOME_QUERY_ORIGIN: origin,
            HOME_QUERY_ANON: token("anon"),
            HOME_QUERY_ADMIN: token("service_role"),
            HOME_QUERY_N: String(n),
            HOME_QUERY_EXPIRED: String(axis === "expired"),
          },
        },
      );
      console.log(output);
      const metrics = statementDeltas(before, await snapshot(db));
      assert(
        metrics.some((row) => !row.toplevel && row.query.includes("products")),
        "Missing nested SQL evidence",
      );
      const cancelled = Number(
        (
          await sql(db, "-c", "select count(*) from public.orders where status = 'cancelled'")
        ).trim(),
      );
      assert.equal(cancelled, axis === "expired" ? n : 0);
      const released = Number(
        (
          await sql(
            db,
            "-c",
            "select count(*) from public.inventory_reservations where status = 'released'",
          )
        ).trim(),
      );
      assert.equal(released, cancelled);
      // A single outer statement must expose N executions of the nested point lookup.
      const controlBefore = await snapshot(db);
      await sql(db, "-c", `select home_probe.repeat_lookup(${n})`);
      const control = statementDeltas(controlBefore, await snapshot(db));
      assert.equal(
        control
          .filter((row) => !row.toplevel && row.query.includes("home_positive_control"))
          .reduce((sum, row) => sum + row.calls, 0),
        n,
      );
      assert.equal(
        control.filter((row) => row.toplevel).reduce((sum, row) => sum + row.calls, 0),
        1,
      );
      matrix.push({
        axis,
        n,
        returnedProducts: n,
        httpCalls: 3,
        cancelled,
        released,
        topLevelSQL: metrics.filter((row) => row.toplevel).reduce((sum, row) => sum + row.calls, 0),
        nestedSQL: metrics.filter((row) => !row.toplevel).reduce((sum, row) => sum + row.calls, 0),
        positiveControlPointLookups: n,
      });
      console.log(JSON.stringify({ axis, n, metrics, positiveControl: control }));
      await docker("stop", "--time", "3", rest);
      owned.delete(rest);
      await waitFor(async () =>
        assert.equal((await docker("ps", "-aq", "--filter", `name=^/${rest}$`)).trim(), ""),
      );
      console.log(`CLEANED container ${rest} (${db})`);
    }
  console.log(`SERVER_COMPONENT_INVOCATION_MATRIX ${JSON.stringify(matrix)}`);
  // Exercise the real SIGTERM handler and its shared finally cleanup, after all
  // measurements. This intentional self-check is not an interrupted experiment.
  signalSelfCheck = true;
  process.kill(process.pid, "SIGTERM");
  await delay();
  assert(stopping, "SIGTERM handler was not exercised");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      stopping = true;
    });
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    if (stopping && !signalSelfCheck) process.exitCode = 130;
    if (signalSelfCheck) console.log("SIGNAL_CLEANUP_VERIFIED SIGTERM");
  }
}
