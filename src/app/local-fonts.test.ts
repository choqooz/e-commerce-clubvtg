import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

const fonts = vi.hoisted(() => ({
  load: vi.fn(({ variable }: { variable: string }) => ({ variable: `${variable}-fixture` })),
}));
vi.mock("next/font/local", () => ({ default: fonts.load }));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: vi.fn() }));
vi.mock("@/app/providers", () => ({ Providers: vi.fn() }));
vi.mock("sonner", () => ({ Toaster: vi.fn() }));

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const globals = source("./globals.css");

describe("Self-hosted storefront typography", () => {
  it("loads only the supplied normal faces with their real weight metadata", () => {
    expect(fonts.load.mock.calls.map(([options]) => options)).toEqual([
      {
        src: "./fonts/FamiljenGrotesk-VariableFont_wght.woff2",
        variable: "--font-familjen-grotesk",
        weight: "400 700",
        style: "normal",
        display: "swap",
      },
      {
        src: "./fonts/MaisonNeueMono-Regular.woff2",
        variable: "--font-maison-neue-mono-local",
        weight: "400",
        style: "normal",
        display: "swap",
      },
    ]);
    expect(source("./layout.tsx")).not.toMatch(/next\/font\/google|https?:\/\/[^"\s]*fonts/);
    expect(globals).not.toMatch(/--font-inter|--font-ibm-plex-mono|https?:\/\/[^"\s]*fonts/);
  });

  it("makes both generated variables available to every route while retaining sans body type", () => {
    const root = RootLayout({ children: "page-fixture" });
    const html = root.props.children;
    expect(html.type).toBe("html");
    expect(html.props.className).toBe(
      "--font-familjen-grotesk-fixture --font-maison-neue-mono-local-fixture h-full antialiased",
    );
    expect(html.props.children.props.className).toContain("font-sans");
  });

  it("retains Next's default preload and metric-adjusted fallback configuration", () => {
    for (const [options] of fonts.load.mock.calls) {
      // next/font/local defaults to preload: true and adjustFontFallback: "Arial".
      for (const override of ["preload", "fallback", "adjustFontFallback", "declarations"]) {
        expect(options).not.toHaveProperty(override);
      }
    }
  });

  it("ships a verified WOFF2 runtime face while retaining byte-exact originals and OFL", () => {
    const assets = {
      "FamiljenGrotesk-VariableFont_wght.woff2":
        "bf73b8a8d6c6336d234c3beafd20cf3e8b2e95eaeb1463e22b117c0087b49fa3",
      "FamiljenGrotesk-VariableFont_wght.ttf":
        "fdd1f37e1aeb0e031a1eb9a921fc970a8f4f0bdf1df647b88ef82d0081a2f5ff",
      "MaisonNeueMono-Regular.woff2":
        "3b7957abcf05c5af57e112df259c93d029339ab6e386df1580d765686073c24a",
      "FamiljenGrotesk-OFL.txt": "807eccaa3cbbbb3a8c7134ab7c0f8de007b888f656c86f345a0c8d7909346487",
    };
    expect(readdirSync(new URL("./fonts/", import.meta.url)).sort()).toEqual(
      [...Object.keys(assets), "README.md"].sort(),
    );
    for (const [name, hash] of Object.entries(assets)) {
      const bytes = readFileSync(new URL(`./fonts/${name}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(hash);
    }
    expect(source("./fonts/FamiljenGrotesk-OFL.txt")).toContain(
      "SIL OPEN FONT LICENSE Version 1.1",
    );
  });

  it("stores the converted face as actual WOFF2, not a renamed TrueType file", () => {
    const bytes = readFileSync(
      new URL("./fonts/FamiljenGrotesk-VariableFont_wght.woff2", import.meta.url),
    );
    expect(bytes.length).toBe(33224);
    expect(bytes.toString("ascii", 0, 4)).toBe("wOF2");
    expect(bytes.readUInt32BE(4)).toBe(0x00010000); // TrueType outlines inside WOFF2.
    expect(bytes.readUInt32BE(8)).toBe(bytes.length); // WOFF2 header's declared length.
    expect(bytes.readUInt16BE(12)).toBeGreaterThan(0); // Font table directory is present.
    expect(bytes.readUInt16BE(14)).toBe(0); // Reserved header field.
  });

  it("maps reference and semantic aliases directly to distinct local variables without cycles", () => {
    const aliases = {
      "f-grotesk": "familjen-grotesk",
      "maison-neue-mono": "maison-neue-mono-local",
      sans: "familjen-grotesk",
      heading: "familjen-grotesk",
      mono: "maison-neue-mono-local",
    };
    for (const [alias, local] of Object.entries(aliases)) {
      const definitions = [...globals.matchAll(new RegExp(`--font-${alias}:\\s*([^;]+);`, "g"))];
      expect(
        definitions.map((match) => match[1]),
        alias,
      ).toEqual([`var(--font-${local})`]);
      // next/font owns these variables: globals must never redeclare them or point back to aliases.
      expect(globals).not.toContain(`--font-${local}:`);
    }
  });

  it("compiles sans headings, mono navigation/price labels and regular 400 without remote faces", async () => {
    const theme = source("../../node_modules/tailwindcss/theme.css");
    const compiler = await compile(
      `${theme}\n${globals.replace(/^@import .*;$/gm, "")}\n@tailwind utilities;`,
    );
    const css = compiler.build([
      "font-sans",
      "font-heading",
      "font-mono",
      "font-f-grotesk",
      "font-maison-neue-mono",
      "font-regular",
      "font-normal",
    ]);
    for (const [utility, local] of [
      ["sans", "familjen-grotesk"],
      ["heading", "familjen-grotesk"],
      ["f-grotesk", "familjen-grotesk"],
      ["mono", "maison-neue-mono-local"],
      ["maison-neue-mono", "maison-neue-mono-local"],
    ]) {
      expect(css).toMatch(
        new RegExp(`\\.font-${utility} \\{\\s*font-family: var\\(--font-${local}\\);`),
      );
    }
    expect(css).toContain("--font-weight-regular: 400;");
    expect(css).toContain("--font-weight-normal: 400;");
    expect(css).toMatch(
      /h6\s*\{\s*font-family: var\(--font-heading\);\s*font-weight: var\(--font-weight-regular\);/,
    );
    for (const selector of ["nav-link", "product-card-price"]) {
      const block = globals.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))?.[1];
      expect(block).toContain("font-family: var(--font-mono)");
      expect(block).toMatch(/font-regular|font-weight: var\(--font-weight-regular\)/);
    }
    expect(css).not.toMatch(
      /@font-face|fonts\.googleapis|fonts\.gstatic|--font-inter|--font-ibm-plex-mono/,
    );
  });
});
