import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
const requireRule = "@typescript-eslint/no-require-imports";
const commonJsPaths = [
  "lint-probe.cjs",
  "branding/tools/lint-probe.cjs",
  "odd/evidence/lint-probe.cjs",
  "scripts/lint-probe.cjs",
];

describe("ESLint CommonJS configuration", () => {
  it.each(commonJsPaths)("allows require without ignoring %s", async (filePath) => {
    expect(await eslint.isPathIgnored(filePath)).toBe(false);

    const results = await eslint.lintText(
      'const path = require("node:path"); module.exports = path;',
      { filePath },
    );

    expect(results).toHaveLength(1);
    expect(results[0].fatalErrorCount).toBe(0);
    expect(results[0].messages).toEqual([]);
  });

  it.each([
    "src/lib/lint-probe.ts",
    "src/components/lint-probe.tsx",
    "scripts/lint-probe.mjs",
    "scripts/lint-probe.js",
  ])("still prohibits require in %s", async (filePath) => {
    const [result] = await eslint.lintText(
      'const path = require("node:path"); export default path;',
      { filePath },
    );

    expect(result.fatalErrorCount).toBe(0);
    expect(result.messages).toEqual([
      expect.objectContaining({ ruleId: requireRule, severity: 2 }),
    ]);
  });

  it("retains unrelated CommonJS rule severities and diagnostics", async () => {
    const [result] = await eslint.lintText(
      [
        'const zlib = require("node:zlib");',
        'const fs = require("node:fs");',
        "const unused = 1;",
        "module.exports = { zlib, fs };",
      ].join("\n"),
      { filePath: "scripts/lint-probe.cjs" },
    );

    expect(result.fatalErrorCount).toBe(0);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "import/order", severity: 1 }),
        expect.objectContaining({
          ruleId: "@typescript-eslint/no-unused-vars",
          severity: 1,
        }),
      ]),
    );
  });
});
