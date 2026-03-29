import "server-only";

import { PostHog } from "posthog-node";

/**
 * Factory function — creates a new PostHog client per request.
 * Returns null when NEXT_PUBLIC_POSTHOG_KEY is not set (graceful degradation).
 *
 * Usage:
 *   const ph = getPostHogServer()
 *   ph?.capture({ distinctId: userId, event: 'my_event', properties: { ... } })
 *   await ph?.shutdown()
 */
export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
