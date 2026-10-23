import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertContainerAbsent,
  assertControl,
  cells,
  summarize,
  parseMode,
  snapshotProtectedFiles,
} from "./sql-cancellation-benchmark.mjs";

const cell = { branch: "coupon", n: 1, m: 10 };
const samples = () =>
  Array.from({ length: 33 }, (_, ordinal) => ({
    ordinal,
    ms: ordinal < 3 ? 999 : ordinal - 2,
    work: {
      cancelled: 1,
      released: 10,
      available: 10,
      items: 10,
      couponEvidence: 1,
      couponReservations: 0,
      usedCount: 0,
      authorizations: 0,
      identityUses: 0,
    },
  }));

const requiredGuardPaths = [
  "scripts/run-database-tests.mjs",
  "scripts/database-test-suite-selection.mjs",
  "scripts/database-test-suite-selection.test.ts",
  "scripts/home-query-attribution.sql",
  "scripts/home-query-attribution.test.ts",
  "scripts/run-home-query-attribution.mjs",
  "src/app/home-query-attribution.test.tsx",
  "supabase/tests/database/036_expire_product_reservations_concurrency.test.sql",
  "scripts/database-test-support.sql",
  "scripts/sql-cancellation-benchmark-fixtures.sql",
  "supabase/migrations/001_initial_schema.sql",
];
const optionalTaskPaths = [
  "odd/tasks/sql-query-attribution.md",
  "odd/tasks/sql-reservation-expiry-batching.md",
];

function guardFixture() {
  // An injected filesystem keeps these tests independent of local ignored inputs.
  const directory = "/isolated-sql-cancellation-test";
  const inputs = new Map(requiredGuardPaths.map((path) => [path, Buffer.from(path)]));
  const entries = new Map<string, { name: string; directory: boolean }[]>([
    ["supabase/migrations", [{ name: "001_initial_schema.sql", directory: false }]],
  ]);
  const failures = new Map<string, string>();
  const missing = (path: string, code = "ENOENT") =>
    Object.assign(new Error(`${code}: ${path}`), { code });
  const io = {
    read: async (path: string) => {
      const key = relative(directory, path);
      if (failures.has(key)) throw missing(key, failures.get(key));
      const value = inputs.get(key);
      if (value === undefined) throw missing(key);
      return value;
    },
    list: async (path: string) => {
      const key = relative(directory, path);
      if (failures.has(key)) throw missing(key, failures.get(key));
      const value = entries.get(key);
      if (value === undefined) throw missing(key);
      return value;
    },
  };
  return { directory, inputs, entries, failures, io };
}

const fontPath = "fonts/family/fixture.ttf";
function populatedGuardFixture() {
  const fixture = guardFixture();
  for (const path of [...optionalTaskPaths, fontPath]) fixture.inputs.set(path, Buffer.from(path));
  fixture.entries.set("fonts", [{ name: "family", directory: true }]);
  fixture.entries.set("fonts/family", [{ name: "fixture.ttf", directory: false }]);
  return fixture;
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("portable protected-file snapshots", () => {
  it("accepts a clean root without local tasks or fonts and records their absence", async () => {
    const fixture = guardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    expect(before).toMatchObject({
      [optionalTaskPaths[0]]: null,
      [optionalTaskPaths[1]]: null,
      fonts: null,
    });
    for (const path of requiredGuardPaths) {
      expect(before[path]).toBe(sha256(fixture.inputs.get(path)!));
    }
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).toEqual(before);
  });

  it("hashes present optional task and nested font bytes without changing them", async () => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    for (const path of [...optionalTaskPaths, fontPath]) {
      expect(before[path]).toBe(sha256(fixture.inputs.get(path)!));
    }
    expect(before.fonts).not.toBeNull();
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).toEqual(before);
  });

  it.each([...optionalTaskPaths, fontPath])("detects changed optional bytes: %s", async (path) => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.inputs.set(path, Buffer.from("changed"));
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it.each(optionalTaskPaths)("detects a present task becoming absent: %s", async (path) => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.inputs.delete(path);
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it.each(optionalTaskPaths)("detects an absent task being created: %s", async (path) => {
    const fixture = guardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.inputs.set(path, Buffer.from("created"));
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it("detects creation of even an empty previously absent fonts tree", async () => {
    const fixture = guardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.entries.set("fonts", []);
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it("detects removal of the previously present fonts root", async () => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.entries.delete("fonts");
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it("resnapshots font membership to detect newly added files", async () => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.entries.get("fonts/family")!.push({ name: "added.ttf", directory: false });
    fixture.inputs.set("fonts/family/added.ttf", Buffer.from("added"));
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it("resnapshots font membership to detect removed files", async () => {
    const fixture = populatedGuardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.entries.set("fonts/family", []);
    fixture.inputs.delete(fontPath);
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });

  it.each(requiredGuardPaths)("still rejects a missing required file: %s", async (path) => {
    const fixture = guardFixture();
    fixture.inputs.delete(path);
    await expect(snapshotProtectedFiles(fixture.directory, fixture.io)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("still requires the migrations directory", async () => {
    const fixture = guardFixture();
    fixture.entries.delete("supabase/migrations");
    await expect(snapshotProtectedFiles(fixture.directory, fixture.io)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(
    [...optionalTaskPaths, "fonts"].flatMap((path) =>
      ["EACCES", "EIO", "ENOTDIR"].map((code) => ({ path, code })),
    ),
  )("propagates $code rather than treating $path as absent", async ({ path, code }) => {
    const fixture = populatedGuardFixture();
    fixture.failures.set(path, code);
    await expect(snapshotProtectedFiles(fixture.directory, fixture.io)).rejects.toMatchObject({
      code,
    });
  });

  it.each(["fonts/family", fontPath])("does not swallow nested font ENOENT: %s", async (path) => {
    const fixture = populatedGuardFixture();
    fixture.failures.set(path, "ENOENT");
    await expect(snapshotProtectedFiles(fixture.directory, fixture.io)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("resnapshots numbered migrations instead of silently freezing their selection", async () => {
    const fixture = guardFixture();
    const before = await snapshotProtectedFiles(fixture.directory, fixture.io);
    fixture.entries.get("supabase/migrations")!.push({ name: "002_next.sql", directory: false });
    fixture.inputs.set("supabase/migrations/002_next.sql", Buffer.from("new migration"));
    expect(await snapshotProtectedFiles(fixture.directory, fixture.io)).not.toEqual(before);
  });
});

describe("baseline-only command line", () => {
  it("accepts only the unchanged no-argument baseline command", () => {
    expect(parseMode([])).toBe("baseline");
    for (const args of [["--compare"], ["--verify-candidate"], ["--unknown"]]) {
      expect(() => parseMode(args)).toThrow(/baseline-only/);
    }
  });

  it.each([
    { args: ["--compare"] },
    { args: ["--verify-candidate"] },
    { args: ["--unknown"] },
    { args: ["--compare", "--verify-candidate"] },
    { args: ["--compare", "--compare"] },
    { args: ["baseline"] },
  ])("rejects $args clearly before any Docker access", ({ args }) => {
    // Intercept the builtin before importing the actual CLI. No Docker process can start,
    // even if an obsolete mode accidentally gets past argument validation.
    const guardedCLI = `
      import childProcess from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      childProcess.spawn = () => { throw new Error("UNEXPECTED_DOCKER_ACCESS"); };
      syncBuiltinESMExports();
      const [script, ...args] = process.argv.slice(1);
      process.argv = [process.execPath, script, ...args];
      await import(pathToFileURL(script).href);
    `;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        guardedCLI,
        fileURLToPath(new URL("./sql-cancellation-benchmark.mjs", import.meta.url)),
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: "/nonexistent-sql-benchmark-test-bin",
          DOCKER_HOST: "unix:///nonexistent-sql-benchmark-test.sock",
        },
        timeout: 10000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.signal).toBeNull();
    const output = result.stdout + result.stderr;
    expect(output).toContain("baseline-only");
    expect(output).toContain("--compare and --verify-candidate are retired");
    expect(output).toContain("node scripts/sql-cancellation-benchmark.mjs");
    expect(output).not.toContain("UNEXPECTED_DOCKER_ACCESS");
    expect(result.stdout).toBe("");
  });
});

describe("owned container removal confirmation", () => {
  it("accepts immediate absence without waiting", async () => {
    let pauses = 0;
    await assertContainerAbsent(
      async () => "",
      async () => {
        pauses++;
      },
    );
    expect(pauses).toBe(0);
  });

  it("waits for asynchronous auto-removal instead of reporting a false leak", async () => {
    let lookups = 0;
    let pauses = 0;
    await assertContainerAbsent(
      async () => (++lookups < 3 ? "owned-container-id\n" : ""),
      async () => {
        pauses++;
      },
    );
    expect(lookups).toBe(3);
    expect(pauses).toBe(2);
  });

  it("still fails when the exact owned resource remains after bounded retries", async () => {
    let lookups = 0;
    let pauses = 0;
    await expect(
      assertContainerAbsent(
        async () => {
          lookups++;
          return "owned-container-id\n";
        },
        async () => {
          pauses++;
        },
      ),
    ).rejects.toThrow("Owned container remains");
    expect(lookups).toBe(50);
    expect(pauses).toBe(49);
  });
});

describe("direct SQL cancellation protocol", () => {
  it("rejects empty or incomplete measurements instead of reporting a benchmark", () => {
    expect(() => summarize(cell, [])).toThrow();
    expect(() => summarize(cell, samples().slice(1))).toThrow();
    expect(() => summarize(cell, [...samples(), samples()[0]])).toThrow();
  });
  it("discards exactly three warmups; computes median and nearest-rank empirical p95", () => {
    expect(summarize(cell, samples())).toMatchObject({
      n: 1,
      m: 10,
      count: 30,
      median: 15.5,
      p95: 29,
      min: 1,
      max: 30,
      warmupMs: [999, 999, 999],
      measuredMs: Array.from({ length: 30 }, (_, index) => index + 1),
    });
  });
  it.each([NaN, Infinity, -1, 0])("rejects invalid server intervals: %s", (ms) => {
    const invalid = samples();
    invalid[5].ms = ms;
    expect(() => summarize(cell, invalid)).toThrow();
  });
  it("rejects no-op cancellation, missing release evidence, and leaked authority", () => {
    for (const [key, value] of [
      ["cancelled", 0],
      ["released", 0],
      ["available", 0],
      ["items", 0],
      ["couponEvidence", 0],
      ["couponReservations", 1],
      ["usedCount", 1],
      ["authorizations", 1],
      ["identityUses", 1],
    ] as const) {
      const invalid = samples();
      invalid[4].work[key] = value;
      expect(() => summarize(cell, invalid)).toThrow();
    }
  });
  it("rejects missing/reordered samples and unknown axes", () => {
    const invalid = samples();
    invalid[4].ordinal = 3;
    expect(() => summarize(cell, invalid)).toThrow();
    expect(() => summarize({ ...cell, n: 0 }, samples())).toThrow();
  });
  it.each([1, 10, 50])(
    "detects %i nested point lookups after PostgreSQL strips PL/pgSQL comments",
    (repetitions) => {
      const metrics = [
        {
          query: "SELECT price from public.products where id = product",
          toplevel: false,
          calls: repetitions,
        },
        { query: "select bench.control($1, $2::uuid)", toplevel: true, calls: 1 },
      ];
      expect(() => assertControl(metrics, repetitions)).not.toThrow();
      expect(() => assertControl(metrics, repetitions + 1)).toThrow();
      expect(() => assertControl(metrics.slice(1), repetitions)).toThrow();
      expect(() => assertControl(metrics.slice(0, 1), repetitions)).toThrow();
      expect(() => assertControl([metrics[0], { ...metrics[1], calls: 2 }], repetitions)).toThrow();
      expect(() =>
        assertControl([{ ...metrics[0], query: "select unrelated" }, metrics[1]], repetitions),
      ).toThrow();
    },
  );
  it.each(cells)("requires useful work for $branch N=$n M=$m", (axes: typeof cell) => {
    const measured = samples().map((sample) => ({
      ...sample,
      work: {
        cancelled: axes.n,
        released: axes.n * axes.m,
        available: axes.n * axes.m,
        items: axes.n * axes.m,
        couponEvidence: axes.branch === "coupon" ? axes.n : 0,
        couponReservations: 0,
        usedCount: 0,
        authorizations: 0,
        identityUses: 0,
      },
    }));
    expect(summarize(axes, measured)).toMatchObject({ ...axes, count: 30, median: 15.5 });
    measured[0].work.couponEvidence += 1;
    expect(() => summarize(axes, measured)).toThrow(/useful work/);
  });
  it("separates order and product axes for both authority branches", () => {
    expect(cells).toHaveLength(10);
    for (const branch of ["promotions", "coupon"]) {
      expect(
        cells.filter((c: typeof cell) => c.branch === branch).map((c: typeof cell) => [c.n, c.m]),
      ).toEqual([
        [1, 1],
        [10, 1],
        [50, 1],
        [1, 10],
        [1, 50],
      ]);
    }
  });
});
