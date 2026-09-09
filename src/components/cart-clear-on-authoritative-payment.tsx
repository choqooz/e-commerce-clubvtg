"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/contexts/cart-context";

interface ClearFlag {
  current: boolean;
}

export async function consumeCartClearProof(orderId: string): Promise<boolean> {
  const response = await fetch("/api/mp-return/cart-clear-proof/consume", {
    body: new URLSearchParams({ order_id: orderId }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  return response.ok;
}

export async function clearCartAfterConsumedProofOnce(
  isHydrated: boolean,
  orderId: string,
  clearCart: () => void,
  attempted: ClearFlag,
  consumeProof = consumeCartClearProof,
) {
  if (!isHydrated || attempted.current) return;
  attempted.current = true;

  try {
    if (await consumeProof(orderId)) clearCart();
  } catch {}
}

interface CartClearOnAuthoritativePaymentProps {
  orderId: string;
}

export function CartClearOnAuthoritativePayment({ orderId }: CartClearOnAuthoritativePaymentProps) {
  const { clearCart, isHydrated } = useCart();
  const attempted = useRef(false);

  useEffect(() => {
    void clearCartAfterConsumedProofOnce(isHydrated, orderId, clearCart, attempted);
  }, [clearCart, isHydrated, orderId]);

  return null;
}
