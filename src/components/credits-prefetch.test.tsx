import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

const probe = vi.hoisted(() => ({
  signedIn: false,
  links: [] as { href: unknown; prefetch: unknown }[],
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    // Supply the asynchronously loaded badge balance without invoking any server action.
    useState: (initial: unknown) =>
      react.useState(
        initial === null && probe.signedIn ? { userId: "test-user", credits: 2 } : initial,
      ),
  };
});
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    "aria-label": label,
  }: ComponentProps<typeof import("next/link").default>) => {
    probe.links.push({ href, prefetch });
    return (
      <a href={String(href)} aria-label={label}>
        {children}
      </a>
    );
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: probe.signedIn, userId: probe.signedIn ? "test-user" : null }),
  useClerk: () => ({}),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  UserButton: Object.assign(() => null, {
    MenuItems: () => null,
    Link: () => null,
    Action: () => null,
  }),
}));
vi.mock("@/contexts/cart-context", () => ({
  useCartHeader: () => ({ totalItems: 0, setIsOpen: vi.fn() }),
}));
vi.mock("@/lib/actions/credits", () => ({ getUserCredits: vi.fn() }));
vi.mock("@/components/ui/sheet", () => {
  // Keep the mobile link in this SSR prop test even when the drawer is closed.
  const Content = ({ children }: { children: ReactNode }) => children;
  return {
    Sheet: Content,
    SheetTrigger: Content,
    SheetContent: Content,
    SheetTitle: Content,
    SheetClose: Content,
  };
});

beforeEach(() => {
  probe.signedIn = false;
  probe.links = [];
});

describe("Credits document navigation", () => {
  it.each([false, true])(
    "uses native header credits links without changing other Next links (signed in: %s)",
    (signedIn) => {
      probe.signedIn = signedIn;
      const markup = renderToStaticMarkup(<SiteHeader />);
      // Native anchors must bypass Next's RSC fetch on click as well as its prefetch.
      expect(probe.links.filter(({ href }) => href === "/credits")).toEqual([]);
      expect(markup.match(/href="\/credits"/g)).toHaveLength(signedIn ? 3 : 2);
      const otherLinks = probe.links.filter(({ href }) => href !== "/credits");
      expect(otherLinks.length).toBeGreaterThan(0);
      for (const link of otherLinks) expect(link.prefetch).toBeUndefined();
      if (signedIn) expect(markup).toContain('aria-label="Créditos IA: 2"');
    },
  );

  it("uses a native footer credits link while preserving its destination and label", () => {
    const markup = renderToStaticMarkup(<SiteFooter />);
    expect(probe.links.filter(({ href }) => href === "/credits")).toEqual([]);
    expect(markup).toContain('href="/credits"');
    expect(markup).toContain("Créditos IA");
    expect(markup).toContain('href="/#catalog"');
  });
});
