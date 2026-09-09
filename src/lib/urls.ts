import "server-only";

const DEFAULT_DEVELOPMENT_ORIGIN = "http://localhost:3000";
const PRODUCTION_TUNNEL_HOST_SUFFIXES = [".ngrok-free.app", ".ngrok.app", ".ngrok.io"] as const;

interface ResolvedUrls {
  siteUrl: string;
  webhookBaseUrl: string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isNonProductionHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = host.split(".").map(Number);
  const isPrivateIpv4 = ipv4.length === 4 && ipv4.every(Number.isInteger) && (
    ipv4[0] === 0 ||
    ipv4[0] === 10 ||
    ipv4[0] === 127 ||
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168)
  );

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid") ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    isPrivateIpv4 ||
    PRODUCTION_TUNNEL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export function normalizeHttpOrigin(value: string): string | null {
  if (value.trim() !== value || !/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin === "null"
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) {
    if (isProduction()) {
      throw new Error("NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin in production.");
    }
    return DEFAULT_DEVELOPMENT_ORIGIN;
  }

  const origin = normalizeHttpOrigin(configured);
  if (!origin || (isProduction() && (!origin.startsWith("https://") || isNonProductionHostname(new URL(origin).hostname)))) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin in production.");
  }
  return origin;
}

export function resolvePaymentUrls(): ResolvedUrls {
  const siteUrl = getPublicAppOrigin();
  const ngrokUrl = process.env.NEXT_PUBLIC_NGROK_URL;

  if (!isProduction() && ngrokUrl) {
    const webhookBaseUrl = normalizeHttpOrigin(ngrokUrl);
    if (!webhookBaseUrl) {
      throw new Error("NEXT_PUBLIC_NGROK_URL must be an absolute HTTP(S) origin without a path, query, or fragment.");
    }
    return { siteUrl, webhookBaseUrl };
  }

  return { siteUrl, webhookBaseUrl: siteUrl };
}
