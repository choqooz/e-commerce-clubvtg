import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicAppOrigin, resolvePaymentUrls } from "./urls";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("payment public origins", () => {
  it("uses localhost defaults outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(resolvePaymentUrls()).toEqual({
      siteUrl: "http://localhost:3000",
      webhookBaseUrl: "http://localhost:3000",
    });
  });

  it("preserves test behavior with a normalized explicit origin", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000/");

    expect(getPublicAppOrigin()).toBe("http://localhost:3000");
  });

  it.each([
    ["missing", undefined],
    ["HTTP", "http://clubvtg.test"],
    ["credentials", "https://user:password@clubvtg.test"],
    ["path", "https://clubvtg.test/checkout"],
    ["query", "https://clubvtg.test?checkout=1"],
    ["fragment", "https://clubvtg.test#checkout"],
    ["localhost", "https://localhost"],
    ["IPv4 loopback", "https://127.0.0.1"],
    ["IPv6 loopback", "https://[::1]"],
    ["ngrok tunnel", "https://example.ngrok-free.app"],
  ])("fails closed in production for %s public app URLs", (_name, appUrl) => {
    vi.stubEnv("NODE_ENV", "production");
    if (appUrl === undefined) vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    else vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);

    expect(() => getPublicAppOrigin()).toThrow("NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin in production.");
  });

  it.each(["https://clubvtg.com", "https://clubvtg.vercel.app"]) (
    "accepts a valid HTTPS production origin: %s",
    (appUrl) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);

      expect(getPublicAppOrigin()).toBe(appUrl);
    },
  );

  it("normalizes a valid production origin and ignores an ngrok URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://clubvtg.com:443/");
    vi.stubEnv("NEXT_PUBLIC_NGROK_URL", "https://temporary-tunnel.test");

    expect(resolvePaymentUrls()).toEqual({
      siteUrl: "https://clubvtg.com",
      webhookBaseUrl: "https://clubvtg.com",
    });
  });

  it("uses a valid ngrok origin only during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_NGROK_URL", "https://temporary-tunnel.test/");

    expect(resolvePaymentUrls()).toEqual({
      siteUrl: "http://localhost:3000",
      webhookBaseUrl: "https://temporary-tunnel.test",
    });
  });
});
