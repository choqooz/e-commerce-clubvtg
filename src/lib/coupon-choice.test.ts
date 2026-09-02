import { describe, expect, it } from "vitest";
import {
  CUSTOMER_COUPON_SOURCES,
  clearCouponChoice,
  isCurrentCouponQuoteResponse,
  isCurrentCouponQuote,
  quoteRequestKey,
  replaceCouponCode,
  startCouponQuoteRequest,
  toCouponCheckoutSelection,
} from "./coupon-choice";

describe("customer coupon choice", () => {
  it("submits a coupon only after an explicit coupon selection", () => {
    expect(toCouponCheckoutSelection({ couponCode: "SAVE50", source: null })).toBeUndefined();
    expect(toCouponCheckoutSelection({ couponCode: " save50 ", source: CUSTOMER_COUPON_SOURCES.COUPON })).toEqual({
      couponCode: "SAVE50",
      source: "coupon",
    });
  });

  it("clears the selected coupon when it is replaced or removed", () => {
    const selected = { couponCode: "SAVE50", source: CUSTOMER_COUPON_SOURCES.COUPON };
    expect(replaceCouponCode("NEW20")).toEqual({ couponCode: "NEW20", source: null });
    expect(clearCouponChoice(selected)).toEqual({ couponCode: "SAVE50", source: null });
  });

  it("invalidates a quote when the coupon or cart changes", () => {
    const quotedKey = quoteRequestKey("SAVE50", ["product-b", "product-a"]);
    expect(isCurrentCouponQuote(quotedKey, quoteRequestKey("save50", ["product-a", "product-b"]))).toBe(true);
    expect(isCurrentCouponQuote(quotedKey, quoteRequestKey("NEW20", ["product-a", "product-b"]))).toBe(false);
    expect(isCurrentCouponQuote(quotedKey, quoteRequestKey("SAVE50", ["product-a"]))).toBe(false);
  });

  it("rejects a late quote response after its coupon, cart, or request identity changes", () => {
    const firstRequest = startCouponQuoteRequest(1, 1);

    expect(isCurrentCouponQuoteResponse(firstRequest, firstRequest, (version) => version === 2)).toBe(false);
    expect(isCurrentCouponQuoteResponse(firstRequest, firstRequest, (version) => version === 3)).toBe(false);

    const replacementRequest = startCouponQuoteRequest(2, 1);
    expect(isCurrentCouponQuoteResponse(firstRequest, replacementRequest, (version) => version === 1)).toBe(false);
    expect(isCurrentCouponQuoteResponse(replacementRequest, replacementRequest, (version) => version === 1)).toBe(true);
  });
});
