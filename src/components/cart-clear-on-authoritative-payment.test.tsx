import { describe, expect, it, vi } from "vitest";
import { clearCartAfterConsumedProofOnce, consumeCartClearProof } from "./cart-clear-on-authoritative-payment";

describe("CartClearOnAuthoritativePayment", () => {
  it("posts the opaque locator with same-origin credentials before clearing the hydrated cart", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const clearCart = vi.fn();
    const attempted = { current: false };

    await clearCartAfterConsumedProofOnce(false, "order-locator", clearCart, attempted);
    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, attempted, consumeCartClearProof);

    expect(fetch).toHaveBeenCalledWith("/api/mp-return/cart-clear-proof/consume", {
      body: new URLSearchParams({ order_id: "order-locator" }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    expect(clearCart).toHaveBeenCalledOnce();
  });

  it("does not clear or retry when proof consumption fails", async () => {
    const clearCart = vi.fn();
    const consumeProof = vi.fn().mockResolvedValue(false);
    const attempted = { current: false };

    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, attempted, consumeProof);
    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, attempted, consumeProof);

    expect(consumeProof).toHaveBeenCalledOnce();
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("keeps the cart after a network failure without retrying", async () => {
    const clearCart = vi.fn();
    const consumeProof = vi.fn().mockRejectedValue(new Error("network failure"));
    const attempted = { current: false };

    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, attempted, consumeProof);
    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, attempted, consumeProof);

    expect(consumeProof).toHaveBeenCalledOnce();
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("allows only the first successful consumption across Strict Mode and a later remount", async () => {
    const clearCart = vi.fn();
    const consumeProof = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const strictModeAttempt = { current: false };

    const firstAttempt = clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, strictModeAttempt, consumeProof);
    const strictModeReplay = clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, strictModeAttempt, consumeProof);
    await Promise.all([firstAttempt, strictModeReplay]);
    await clearCartAfterConsumedProofOnce(true, "order-locator", clearCart, { current: false }, consumeProof);

    expect(consumeProof).toHaveBeenCalledTimes(2);
    expect(clearCart).toHaveBeenCalledOnce();
  });
});
