"use client";

import { AnalyticsProvider } from "@/contexts/analytics-context";
import { CartProvider } from "@/contexts/cart-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsProvider>
      <CartProvider>{children}</CartProvider>
    </AnalyticsProvider>
  );
}
