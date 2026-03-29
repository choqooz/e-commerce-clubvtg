"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { CartProvider } from "@/contexts/cart-context";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (key) {
      posthog.init(key, {
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
        persistence: "memory",
        disable_session_recording: true,
      });
    }
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <CartProvider>{children}</CartProvider>
    </PostHogProvider>
  );
}
