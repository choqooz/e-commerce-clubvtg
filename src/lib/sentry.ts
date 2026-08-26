import "server-only";

import * as Sentry from "@sentry/nextjs";

export function captureExceptionSafely(error: unknown): void {
  try {
    Sentry.captureException(error);
  } catch {
    // Telemetry must not alter the caller's business error contract.
  }
}
