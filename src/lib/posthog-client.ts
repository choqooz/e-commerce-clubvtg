interface PostHogClientConfig {
  api_host: string;
  disable_session_recording: boolean;
  persistence: "memory";
}

interface PostHogClient {
  init: (key: string, config: PostHogClientConfig) => unknown;
}

export function initializePostHogClient(client: PostHogClient, key: string | undefined, host: string | undefined): void {
  if (!key) return;

  client.init(key, {
    api_host: host ?? "https://eu.i.posthog.com",
    persistence: "memory",
    disable_session_recording: true,
  });
}
