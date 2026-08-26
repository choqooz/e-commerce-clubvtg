"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { CartProvider } from "@/contexts/cart-context";
import { initializePostHogClient } from "@/lib/posthog-client";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initializePostHogClient(
      posthog,
      process.env.NEXT_PUBLIC_POSTHOG_KEY,
      process.env.NEXT_PUBLIC_POSTHOG_HOST,
    );
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <CartProvider>{children}</CartProvider>
    </PostHogProvider>
  );
}
