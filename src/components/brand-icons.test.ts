import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, projectRoot));
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
// These hashes were verified byte-for-byte against approved masters before publication.
// Runtime checks use only the delivered assets, not the historical kit or exporter.
const publicIcons = "public/branding/clubvtg/";
const assets = [
  [
    "favicon.ico",
    "src/app/favicon.ico",
    "caa2078e85736c1b107b2b4e9fde07b2e4b6db7ec6a582002cad46cab26524b4",
  ],
  [
    "favicon.svg",
    "src/app/icon.svg",
    "a5ba57aae41d3b5f2e6074a35fb16a7d20c7f40a5523e073a1b32413b378a106",
  ],
  [
    "apple-touch-icon.png",
    "src/app/apple-icon.png",
    "d7a3e0364f33d5efef390fc9d1733381fb7cc3ff2e18af2debbcc503ad86a7cc",
  ],
  [
    "icon-192.png",
    `${publicIcons}icon-192.png`,
    "5c661a4547cad8e4cd97cd0961771739ddb24807c77f1b06606d1b125f3fa898",
  ],
  [
    "icon-512.png",
    `${publicIcons}icon-512.png`,
    "2878915393cc0c45077140477f7358409aa226530a2f79c49883c71407b53f3d",
  ],
  [
    "maskable-512.png",
    `${publicIcons}maskable-512.png`,
    "61f49798e8b3875b46947af31c44b9f5f366f7b859410a6480105381195278d6",
  ],
] as const;

describe("Approved Next file-convention brand icons", () => {
  it.each(assets)("copies %s without changing a byte", (_name, destination, hash) => {
    expect(sha256(read(destination))).toBe(hash);
  });

  it.each([
    ["src/app/apple-icon.png", 180],
    [`${publicIcons}icon-192.png`, 192],
    [`${publicIcons}icon-512.png`, 512],
    [`${publicIcons}maskable-512.png`, 512],
  ] as const)("preserves %s dimensions", (path, size) => {
    const png = read(path);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  });

  it("uses the corrected small symbol and retains adaptive light/dark fills", () => {
    const icon = read("src/app/icon.svg").toString();
    // Corrected small-symbol geometry from the approved master, not the full-size mark.
    expect(icon.match(/ d="([^"]+)"/)?.[1]).toBe(
      "M72 48C62 38 51 34 38 34C14 34 0 49 0 72C0 95 14 110 38 110C51 110 62 106 72 96L60 84C54 90 47 94 39 94C24 94 17 86 17 72C17 58 24 50 39 50C47 50 54 54 60 60Z",
    );
    expect(icon).toContain('viewBox="0 0 256 256"');
    expect(icon).toContain('transform="translate(-34.05 -35.06) scale(1.268)"');
    expect(icon).toContain('transform="translate(36 -55) scale(2.55)"');
    expect(icon).toContain('fill="#000000"');
    expect(icon).toContain("@media(prefers-color-scheme:dark){path{fill:#ffffff}}");
  });

  it("retains approved small-symbol PNGs in all three ICO frames without regeneration", () => {
    const ico = read("src/app/favicon.ico");
    // The approved exporter used the corrected small symbol for these PNG frames;
    // pinning the complete ICO protects every embedded frame's exact bytes too.
    expect(sha256(ico)).toBe("caa2078e85736c1b107b2b4e9fde07b2e4b6db7ec6a582002cad46cab26524b4");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    let frameEnd = 6 + 3 * 16;
    for (const [index, size] of [16, 32, 48].entries()) {
      const entry = 6 + index * 16;
      expect([ico[entry], ico[entry + 1]]).toEqual([size, size]);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(length).toBeGreaterThan(24);
      expect(offset).toBe(frameEnd);
      frameEnd = offset + length;
      expect(frameEnd).toBeLessThanOrEqual(ico.length);
      const frame = ico.subarray(offset, frameEnd);
      expect(frame.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([frame.readUInt32BE(16), frame.readUInt32BE(20)]).toEqual([size, size]);
    }
    expect(frameEnd).toBe(ico.length);
  });

  it("adapts only manifest icon routes and keeps the approved maskable purpose", () => {
    const manifest = JSON.parse(read("src/app/manifest.webmanifest").toString());
    // Approved manifest data is unchanged except for the three public icon routes.
    expect(manifest).toEqual({
      name: "ClubVTG",
      icons: [
        { src: "/branding/clubvtg/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/branding/clubvtg/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/branding/clubvtg/maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      theme_color: "#000000",
      background_color: "#000000",
      display: "standalone",
    });
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\/branding\/clubvtg\//);
      expect(existsSync(new URL(`public${icon.src}`, projectRoot))).toBe(true);
    }
  });

  it("has no conflicting file-convention icons or manual icon/manifest links", () => {
    const files = readdirSync(new URL("src/app/", projectRoot), { recursive: true }).map(String);
    const convention =
      /(?:^|\/)(?:favicon|icon\d*|apple-icon\d*|manifest)\.(?:ico|svg|png|jpe?g|[jt]sx?|json|webmanifest)$/;
    expect(files.filter((file) => convention.test(file)).sort()).toEqual([
      "apple-icon.png",
      "favicon.ico",
      "icon.svg",
      "manifest.webmanifest",
    ]);
    const metadataFiles = files.filter((file) =>
      /(?:^|\/)(?:layout|page|head)\.[jt]sx?$/.test(file),
    );
    for (const file of metadataFiles) {
      const source = read(`src/app/${file}`).toString();
      expect(source, file).not.toMatch(/\b(?:icons|manifest)\s*:/);
      expect(source, file).not.toMatch(
        /\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon|manifest)["']/,
      );
    }
    for (const name of [
      "favicon.ico",
      "icon.svg",
      "apple-touch-icon.png",
      "manifest.json",
      "manifest.webmanifest",
      "site.webmanifest",
    ]) {
      expect(existsSync(new URL(`public/${name}`, projectRoot)), name).toBe(false);
    }
  });
});
