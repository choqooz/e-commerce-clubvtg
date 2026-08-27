import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");
const supportSql = "/workspace/scripts/database-test-support.sql";
const database = "database_test";
const password = "database_test_password";
const activeContainers = new Set();
let interrupted = false;

const suites = [
  ["013_harden_supabase_rpcs", 13],
  ["014_legacy_payment_inventory_audit", 13],
  ["015_payment_integrity_foundations", 13],
  ["016_credit_purchase_transactions", 15],
  ["017_owned_inventory_reservations", 17],
  ["018_product_payment_settlement", 17],
  ["019_bonus", 18, "bonus"],
  ["020_retention", 19, "retention"],
  ["021_anonymization", 20, "anonymization"],
  ["022_activation", 21, "activation"],
];

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, ...options });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0 ? resolveRun(output) : rejectRun(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`)));
  });
}

async function docker(args) {
  return run("docker", args);
}

async function cleanup(container) {
  if (!container) return;
  try {
    await docker(["rm", "-f", container]);
    await docker(["container", "inspect", container]).then(
      () => { throw new Error(`container still exists: ${container}`); },
      () => undefined,
    );
    console.log(`CLEANED ${container}`);
  } finally {
    activeContainers.delete(container);
  }
}

async function cleanupAll(exitCode) {
  await Promise.allSettled([...activeContainers].map(cleanup));
  if (exitCode !== undefined) process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    console.error(`Received ${signal}; cleaning disposable containers.`);
    void cleanupAll(130);
  });
}

function psql(container, file, variables = {}) {
  const options = [
    "-c", "app.disposable_test=true",
    "-c", `app.disposable_dblink_connection=postgresql://postgres:${password}@127.0.0.1:5432/${database}`,
  ];
  if (variables.retention) options.push("-c", "app.retention_predecessor_fixture=true");
  const args = ["exec", "-e", `PGOPTIONS=${options.join(" ")}`, container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
  for (const [name, value] of Object.entries(variables)) if (value !== true) args.push("-v", `${name}=${value}`);
  return docker([...args, "-f", file]);
}

async function ready(container) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await psql(container, "/dev/stdin");
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
  }
  throw new Error("PostgreSQL did not become ready within 30 seconds");
}

async function runSuite(suite, migrationFiles) {
  const [name, maxMigration, phase] = suite;
  const container = `clubvtg-db-test-${process.pid}-${name}`;
  activeContainers.add(container);
  try {
    await docker(["run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "-v", `${root}:/workspace:ro`, "postgres:17"]);
    await ready(container);
    await psql(container, supportSql);
    for (const migration of migrationFiles.filter(({ number }) => number <= maxMigration)) await psql(container, migration.file);
    if (phase === "bonus") {
      await psql(container, "/workspace/scripts/database-test-fixtures.sql", { fixture_bonus: "1" });
      await psql(container, "/workspace/supabase/migrations/019_prepare_registration_bonus.sql");
    }
    if (phase === "retention") {
      await psql(container, `/workspace/supabase/tests/database/${name}.test.sql`, { predecessor_fixture_only: "1", retention: true });
      await psql(container, "/workspace/supabase/migrations/020_prepare_financial_retention.sql");
      await psql(container, "/workspace/scripts/database-test-fixtures.sql", { fixture_retention: "1" });
    }
    if (phase === "anonymization") {
      await psql(container, "/workspace/scripts/database-test-fixtures.sql", { fixture_anonymization: "1" });
      await psql(container, "/workspace/supabase/migrations/021_prepare_clerk_anonymization.sql");
    }
    if (phase === "activation") {
      await psql(container, `/workspace/supabase/tests/database/${name}.test.sql`, { pre_activation: "1" });
      await psql(container, "/workspace/supabase/migrations/022_activate_clerk_lifecycle.sql");
    }
    const output = await psql(container, `/workspace/supabase/tests/database/${name}.test.sql`, phase === "retention" ? { retention: true } : {});
    return { name, output };
  } finally {
    await cleanup(container);
  }
}

async function main() {
  try {
    await docker(["version", "--format", "{{.Server.Version}}"]).then((version) => console.log(`Docker server ${version.trim()}`));
  } catch (error) {
    console.error(`Docker is required for isolated database tests.\n${error.message}`);
    process.exitCode = 1;
    return;
  }
  const migrationFiles = (await readdir(migrationsDir)).sort().map((name) => ({
    file: `/workspace/supabase/migrations/${name}`,
    number: Number.parseInt(name, 10),
  })).filter(({ number }) => Number.isInteger(number));
  const results = [];
  for (const suite of suites) {
    if (interrupted) break;
    try {
      results.push({ ...(await runSuite(suite, migrationFiles)), passed: true });
      console.log(`PASS ${suite[0]}`);
    } catch (error) {
      results.push({ name: suite[0], passed: false, output: error.message });
      console.error(`FAIL ${suite[0]}\n${error.message}`);
    }
  }
  console.log(`Database suites: ${results.filter(({ passed }) => passed).length}/${suites.length} passed`);
  if (results.some(({ passed }) => !passed) || interrupted) process.exitCode = 1;
}

try {
  await main();
} finally {
  await cleanupAll();
}
