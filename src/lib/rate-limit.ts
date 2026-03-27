import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiter for AI try-on: 5 requests per minute per user
// Falls back to no-op if Upstash env vars are not configured (development)
function createRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Development fallback: no rate limiting
    return {
      limit: async (_identifier: string) => ({
        success: true,
        limit: 5,
        remaining: 5,
        reset: Date.now() + 60000,
      }),
    };
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: true,
    prefix: "clubvtg:tryon",
  });
}

export const rateLimiter = createRateLimiter();
