import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Ratelimit: vi.fn(),
  Redis: vi.fn(),
  slidingWindow: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(mocks.Ratelimit, { slidingWindow: mocks.slidingWindow }),
}));
vi.mock("@upstash/redis", () => ({ Redis: mocks.Redis }));

const ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
] as const;
const savedEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

function resetRateLimitEnvironment() {
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  vi.clearAllMocks();
  vi.resetModules();
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.clearAllMocks();
  vi.resetModules();
});

describe("AI rate limiter configuration", () => {
  it("uses the no-op limiter only outside production when both credentials are absent", async () => {
    resetRateLimitEnvironment();
    Object.assign(process.env, { NODE_ENV: "development" });

    const { rateLimiter } = await import("./rate-limit");

    await expect(rateLimiter.limit("user_123")).resolves.toMatchObject({
      limit: 5,
      remaining: 5,
      success: true,
    });
    expect(mocks.Redis).not.toHaveBeenCalled();
  });

  it("fails closed when production credentials are both absent", async () => {
    resetRateLimitEnvironment();
    Object.assign(process.env, { NODE_ENV: "production" });

    await expect(import("./rate-limit")).rejects.toThrow(
      "Missing required Upstash Redis configuration in production",
    );
  });

  it.each(["development", "production"])(
    "rejects partial credentials in %s",
    async (environment) => {
      resetRateLimitEnvironment();
      Object.assign(process.env, { NODE_ENV: environment });
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";

      await expect(import("./rate-limit")).rejects.toThrow(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together",
      );
    },
  );

  it("configures a five-per-minute limiter without making a network call", async () => {
    resetRateLimitEnvironment();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    mocks.slidingWindow.mockReturnValue("five-per-minute");

    await import("./rate-limit");

    expect(mocks.Redis).toHaveBeenCalledWith({
      token: "test-token",
      url: "https://redis.example.test",
    });
    expect(mocks.slidingWindow).toHaveBeenCalledWith(5, "1 m");
    expect(mocks.Ratelimit).toHaveBeenCalledWith({
      analytics: true,
      limiter: "five-per-minute",
      prefix: "clubvtg:tryon",
      redis: expect.anything(),
    });
  });
});
