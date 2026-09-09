import "server-only";
import { getPublicAppOrigin, normalizeHttpOrigin } from "@/lib/urls";

export function getTrustedPublicOrigin(): string | null {
  try {
    return getPublicAppOrigin();
  } catch {
    return null;
  }
}

export function hasTrustedPublicOrigin(origin: string | null): boolean {
  const trustedOrigin = getTrustedPublicOrigin();
  const normalizedOrigin = origin === null ? null : normalizeHttpOrigin(origin);
  return trustedOrigin !== null && normalizedOrigin === trustedOrigin;
}
