import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

const root = process.cwd();
const sentryConfigs = [
  "./sentry.server.config",
  "./sentry.edge.config",
  "./instrumentation-client",
] as const;

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("observability runtime contract", () => {
  it.each(sentryConfigs)("does not initialize %s without a DSN", async (config) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await import(config);

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it.each(sentryConfigs)("initializes %s with the required trace sample rate", async (config) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");

    await import(config);

    expect(sentry.init).toHaveBeenCalledWith({
      dsn: "https://public@example.invalid/1",
      tracesSampleRate: 0.1,
    });
  });
});

describe("local configuration documentation", () => {
  it("ships an allow-listed secret-free example whose names are documented", () => {
    const examplePath = join(root, ".env.local.example");
    expect(existsSync(examplePath)).toBe(true);

    const example = readFileSync(examplePath, "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const ignored = readFileSync(join(root, ".gitignore"), "utf8");
    const names = [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]);

    expect(ignored).toContain("!.env.local.example");
    expect(names).not.toHaveLength(0);
    for (const name of names) expect(readme).toContain(`\`${name}\``);
    const safeDefaults = new Set(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "SHIPPING_FLAT_FEE", "CREDIT_PACK_BASIC_AMOUNT", "CREDIT_PACK_BASIC_PRICE", "CREDIT_PACK_POPULAR_AMOUNT", "CREDIT_PACK_POPULAR_PRICE", "CREDIT_PACK_PRO_AMOUNT", "CREDIT_PACK_PRO_PRICE"]);
    for (const [, name, value] of example.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) if (!safeDefaults.has(name)) expect(value, `${name} must be blank`).toBe("");
    expect(readme).toMatch(/MP_WEBHOOK_SECRET.*fuera del repositorio/);
    expect(readme).toMatch(/NEXT_PUBLIC_NGROK_URL.*nunca dirijas un webhook de produccion/i);
    expect(readme).not.toContain("Vercel");
    for (const claim of [/\bDNS\b/i, /\b(?:provider[- ]?)?provision(?:ing|amiento)?\b/i, /\b(?:deploy(?:ment)?|despliegue)\b/i, /\b(?:env(?:ironment)?|entorno)\b.*\b(?:upload(?:s|ed)?|subir|subida|carga)\b/i, /\b(?:upload(?:s|ed)?|subir|subida|carga)\b.*\b(?:env(?:ironment)?|entorno)\b/i]) expect(readme).not.toMatch(claim);
  });
});
