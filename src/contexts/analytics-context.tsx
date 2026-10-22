"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createDeferredPostHog, type AnalyticsCapture } from "@/lib/deferred-posthog";

const AnalyticsContext = createContext<AnalyticsCapture | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [analytics] = useState(() =>
    createDeferredPostHog({
      key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    }),
  );

  useEffect(() => {
    void analytics.start();
    // No readiness state or cleanup reset: effect replay shares one load/queue.
    // The helper bounds retention even if loading stalls or this tree unmounts.
  }, [analytics]);

  return <AnalyticsContext.Provider value={analytics.client}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}
