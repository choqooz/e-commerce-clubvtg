export const CUSTOMER_COUPON_SOURCES = { COUPON: "coupon" } as const;
export type CustomerCouponSource = (typeof CUSTOMER_COUPON_SOURCES)[keyof typeof CUSTOMER_COUPON_SOURCES];

export const COUPON_QUOTE_SOURCES = { COUPON: "coupon", PROMOTIONS: "promotions" } as const;
export type CouponQuoteSource = (typeof COUPON_QUOTE_SOURCES)[keyof typeof COUPON_QUOTE_SOURCES];

export interface CustomerCouponChoice {
  couponCode: string;
  source: CustomerCouponSource | null;
}

export interface CouponCheckoutSelection {
  couponCode: string;
  source: CustomerCouponSource;
}

export interface CouponQuoteRequest {
  identity: number;
  version: number;
}

export function clearCouponChoice(choice: CustomerCouponChoice): CustomerCouponChoice {
  return { ...choice, source: null };
}

export function replaceCouponCode(couponCode: string): CustomerCouponChoice {
  return { couponCode, source: null };
}

export function quoteRequestKey(couponCode: string, productIds: string[]): string {
  return `${couponCode.trim().toUpperCase()}:${[...productIds].sort().join(",")}`;
}

export function isCurrentCouponQuote(quotedKey: string, currentKey: string): boolean {
  return quotedKey === currentKey;
}

export function startCouponQuoteRequest(identity: number, version: number): CouponQuoteRequest {
  return { identity, version };
}

export function isCurrentCouponQuoteResponse(request: CouponQuoteRequest, currentRequest: CouponQuoteRequest | null, isCurrentVersion: (version: number) => boolean): boolean {
  return request.identity === currentRequest?.identity && isCurrentVersion(request.version);
}

export function toCouponCheckoutSelection(choice: CustomerCouponChoice): CouponCheckoutSelection | undefined {
  const couponCode = choice.couponCode.trim().toUpperCase();
  if (choice.source !== CUSTOMER_COUPON_SOURCES.COUPON || couponCode === "") return undefined;
  return { couponCode, source: CUSTOMER_COUPON_SOURCES.COUPON };
}
