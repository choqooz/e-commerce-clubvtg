import { afterEach, describe, expect, it, vi } from "vitest";
import { getPostHogServer } from "./posthog";
import { initializePostHogClient } from "./posthog-client";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("PostHog configuration", () => {
  it("does not construct a server client without a key", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");

    expect(getPostHogServer()).toBeNull();
  });

  it("skips client initialization without a key and preserves memory-only settings", () => {
    const init = vi.fn();

    initializePostHogClient({ init }, "", undefined);
    expect(init).not.toHaveBeenCalled();

    initializePostHogClient({ init }, "phc_example", undefined);
    expect(init).toHaveBeenCalledWith("phc_example", {
      api_host: "https://eu.i.posthog.com",
      persistence: "memory",
      disable_session_recording: true,
    });
  });
});
