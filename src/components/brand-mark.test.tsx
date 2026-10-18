import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { esES } from "@clerk/localizations";
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import { BrandMark } from "./brand-mark";

// Inspect the root JSX without mounting Clerk, analytics, fonts or any live service.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "inter-fixture" }),
  IBM_Plex_Mono: () => ({ variable: "mono-fixture" }),
}));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: vi.fn(), SignIn: vi.fn() }));
vi.mock("@/app/providers", () => ({ Providers: vi.fn() }));
vi.mock("sonner", () => ({ Toaster: vi.fn() }));

const asset = (tone: string) =>
  readFileSync(
    new URL(`../../public/branding/clubvtg/clubvtg-horizontal-${tone}.svg`, import.meta.url),
  );

describe("Approved ClubVTG brand mark", () => {
  it.each(["black", "white"] as const)("serves the byte-exact approved %s SVG", (tone) => {
    const published = asset(tone);
    // Pinned after byte-for-byte verification against the approved black/white masters;
    // tests consume only published assets, not the historical branding archive.
    const hashes = {
      black: "4378d75ea69aeba0abbf3a7026246348872e23c382c163c3dce277fc50b6a379",
      white: "a6c5cf243eebe6373536de5907b626ff0784998dcbc474d92b03e5e37ecdde4a",
    };
    expect(createHash("sha256").update(published).digest("hex")).toBe(hashes[tone]);
    const image = BrandMark({ tone });
    expect(image.props).toMatchObject({
      src: `/branding/clubvtg/clubvtg-horizontal-${tone}.svg`,
      alt: "clubvtg",
      width: 554,
      height: 194,
      unoptimized: true,
    });
    const markup = renderToStaticMarkup(image);
    expect(markup).toContain('width="554" height="194"');
    expect(markup).toContain('alt="clubvtg"');
    expect(markup).not.toMatch(
      /_next\/image|<svg|object-cover|filter|transform|shadow|overflow-hidden/,
    );
  });

  it("preserves every byte of the approved search header outside the brand substitution", () => {
    const header = readFileSync(new URL("./site-header.tsx", import.meta.url), "utf8");
    const previous = header
      .replace('import { BrandMark } from "@/components/brand-mark";\n', "")
      .replace(
        '            <BrandMark alt="" className="w-[120px] md:w-[180px]" />',
        '            <span className="font-sans text-[20px] leading-none font-normal tracking-[-0.04em] md:text-[30px]">\n              clubvtg\n            </span>',
      );
    expect(createHash("sha256").update(previous).digest("hex")).toBe(
      "00744a99c137417d27ca56cab3fa9534aa0b5dc83d81a1bef4845641c1bce4ca",
    );
  });

  it("keeps the named home link as the single accessible brand name", () => {
    const image = BrandMark({ alt: "", className: "w-[120px] md:w-[180px]" });
    expect(image.props.className).toBe("block h-auto shrink-0 w-[120px] md:w-[180px]");
    const markup = renderToStaticMarkup(
      <Link href="/" aria-label="clubvtg — Inicio">
        {image}
      </Link>,
    );
    expect(markup).toContain('alt=""');
    expect(markup.match(/clubvtg — Inicio/g)).toHaveLength(1);
    expect(markup).not.toContain('alt="clubvtg"');
  });
});

describe("Shared Clerk v7 brand appearance", () => {
  it("brands modal and route through the existing provider without changing auth options", () => {
    const root = RootLayout({ children: "page-fixture" });
    expect(Object.keys(root.props).sort()).toEqual([
      "afterSignOutUrl",
      "appearance",
      "children",
      "localization",
    ]);
    expect(root.props.localization).toBe(esES);
    expect(root.props.afterSignOutUrl).toBe("/");
    expect(root.props.appearance).toEqual({
      options: { logoImageUrl: "/branding/clubvtg/clubvtg-horizontal-black.svg" },
      elements: {
        logoBox: {
          alignSelf: "center",
          marginInline: "auto",
          width: "180px",
          maxWidth: "100%",
          height: "auto",
          aspectRatio: "554 / 194",
        },
        logoImage: { width: "100%", height: "auto", maxHeight: "none", aspectRatio: "554 / 194" },
      },
    });
    // The route's existing element overrides inherit the provider's logo options and dimensions.
    const route = SignInPage().props.children;
    expect(Object.keys(route.props)).toEqual(["appearance"]);
    expect(Object.keys(route.props.appearance)).toEqual(["elements"]);
    expect(route.props.appearance.elements).not.toHaveProperty("logoImage");
    expect(route.props.appearance.elements).not.toHaveProperty("logoBox");
  });
});
