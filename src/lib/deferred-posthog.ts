import { initializePostHogClient } from "./posthog-client";

// Only the capability used by storefront consumers, not a stand-in for the SDK.
export interface AnalyticsCapture {
  capture(event: string, properties?: Record<string, unknown>): void;
}

interface CaptureCall {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: Date;
}

type CaptureSdk = Parameters<typeof initializePostHogClient>[0] & {
  capture(
    event: string,
    properties: Record<string, unknown> | undefined,
    options: { timestamp: Date },
  ): void;
};

interface DeferredOptions {
  key: string | undefined;
  host?: string;
  load?: () => Promise<CaptureSdk>;
  now?: () => Date;
}

const MAX_QUEUED_EVENTS = 100;

export function createDeferredPostHog({
  key,
  host,
  load = async () => (await import("posthog-js")).default,
  now = () => new Date(),
}: DeferredOptions) {
  let state: "disabled" | "waiting" | "loading" | "ready" | "failed" = key ? "waiting" : "disabled";
  let sdk: CaptureSdk | undefined;
  let started: Promise<void> | undefined;
  const queue: CaptureCall[] = [];

  function failInitialization() {
    state = "failed";
    queue.length = 0;
    sdk = undefined;
  }

  function send(call: CaptureCall) {
    try {
      sdk!.capture(call.event, call.properties, { timestamp: call.timestamp });
    } catch {
      // A failed event is not retried, but must not block other captures.
    }
  }

  const client: AnalyticsCapture = {
    capture(event, properties) {
      if (state === "disabled" || state === "failed") return;
      if (state !== "ready" && queue.length >= MAX_QUEUED_EVENTS) return;
      const call = {
        event,
        properties: properties ? { ...properties } : undefined,
        timestamp: now(),
      };
      if (state !== "ready") {
        queue.push(call);
        return;
      }
      send(call);
    },
  };

  function start(): Promise<void> {
    if (started) return started;
    if (state === "disabled") return (started = Promise.resolve());
    state = "loading";
    // Best effort only: overflow, SDK failure or navigation can lose events.
    // Pending retention is bounded by count, not by an arbitrary loading deadline.
    started = Promise.resolve()
      .then(load)
      .then((loaded) => {
        initializePostHogClient(loaded, key, host);
        sdk = loaded;
        // Keep buffering during initialization/flush, including reentrant captures.
        while (queue.length) send(queue.shift()!);
        state = "ready";
      })
      .catch(failInitialization);
    return started;
  }

  return { client, start };
}
