import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiter for AI try-on: 5 requests per minute per user
function createRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url && !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing required Upstash Redis configuration in production: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      );
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      limit: async (_identifier: string) => ({
        success: true,
        limit: 5,
        remaining: 5,
        reset: Date.now() + 60000,
      }),
    };
  }

  if (!url || !token) {
    throw new Error(
      "Invalid Upstash Redis configuration: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together.",
    );
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: true,
    prefix: "clubvtg:tryon",
  });
}

export const rateLimiter = createRateLimiter();
