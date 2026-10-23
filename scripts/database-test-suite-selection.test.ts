import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { selectDatabaseSuites } from "./database-test-suite-selection.mjs";

const suites = [
  ["old", 17],
  ["current", 20261008174309],
];

describe("database suite selection before Docker", () => {
  it("preserves all suites and their order by default", () => {
    expect(selectDatabaseSuites(suites, [])).toEqual(suites);
  });

  it("selects only named suites, including repeated flags in requested order", () => {
    expect(selectDatabaseSuites(suites, ["--suite", "current", "--suite", "old"])).toEqual([
      suites[1],
      suites[0],
    ]);
  });

  it("rejects CLI mistakes before trying Docker, even when Docker is unavailable", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-database-tests.mjs", "--suite", "unknown"],
      {
        encoding: "utf8",
        env: { PATH: "", NODE_ENV: "test" },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing or unknown suite: unknown");
    expect(result.stderr).not.toContain("Docker is required");
    expect(result.stdout).toBe("");
  });

  it.each([
    ["--suite"],
    ["--suite", ""],
    ["--suite", " "],
    ["--suite", "unknown"],
    ["--suite", "old", "--suite", "old"],
    ["--unknown"],
    ["old"],
    ["--suite=old"],
    ["--suite", "--suite"],
  ])("rejects invalid arguments %j instead of silently running all suites", (...args) => {
    expect(() => selectDatabaseSuites(suites, args)).toThrow();
  });
});
