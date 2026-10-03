"use client";

import { Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useCart } from "@/contexts/cart-context";
import { quoteCouponCheckout, type CouponQuote } from "@/lib/actions/coupon-quote";
import { COUPON_QUOTE_SOURCES, CUSTOMER_COUPON_SOURCES, isCurrentCouponQuote, isCurrentCouponQuoteResponse, quoteRequestKey, startCouponQuoteRequest, type CouponQuoteRequest, type CouponQuoteSource } from "@/lib/coupon-choice";
import { formatQuoteCents } from "@/lib/quote-display";

const QUOTE_STATUS = { ERROR: "error", IDLE: "idle", LOADING: "loading", SUCCESS: "success" } as const;
type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

interface QuoteState {
  error: string | null;
  key: string | null;
  quote: CouponQuote | null;
  status: QuoteStatus;
}

export function CouponSelection() {
  const {
    clearCouponSelection,
    couponCode,
    couponSource,
    getCouponQuoteVersion,
    isCouponQuoteVersionCurrent,
    items,
    selectCoupon,
    setCouponCode,
  } = useCart();
  const [quoteState, setQuoteState] = useState<QuoteState>({
    error: null,
    key: null,
    quote: null,
    status: QUOTE_STATUS.IDLE,
  });
  const currentKey = quoteRequestKey(couponCode, items.map((item) => item.product.id));
  const currentRequestRef = useRef<CouponQuoteRequest | null>(null);
  const requestIdentityRef = useRef(0);
  const quote = quoteState.key && isCurrentCouponQuote(quoteState.key, currentKey) ? quoteState.quote : null;
  const error = quoteState.key && isCurrentCouponQuote(quoteState.key, currentKey) ? quoteState.error : null;
  const isLoading = quoteState.status === QUOTE_STATUS.LOADING && quoteState.key === currentKey;

  async function requestQuote(selectedSource?: CouponQuoteSource): Promise<CouponQuote | null> {
    const key = currentKey;
    clearCouponSelection();
    const request = startCouponQuoteRequest(++requestIdentityRef.current, getCouponQuoteVersion());
    currentRequestRef.current = request;
    setQuoteState({ error: null, key, quote: null, status: QUOTE_STATUS.LOADING });
    const result = await quoteCouponCheckout(
      items.map((item) => ({ product: { id: item.product.id }, quantity: 1 as const })),
      couponCode,
      selectedSource,
    );
    if (!isCurrentCouponQuoteResponse(request, currentRequestRef.current, isCouponQuoteVersionCurrent)) return null;
    if (!result.success) {
      setQuoteState({ error: result.error, key, quote: null, status: QUOTE_STATUS.ERROR });
      return null;
    }
    setQuoteState({ error: null, key, quote: result.quote, status: QUOTE_STATUS.SUCCESS });
    return result.quote;
  }

  async function selectCouponQuote() {
    const selectedQuote = await requestQuote(COUPON_QUOTE_SOURCES.COUPON);
    if (selectedQuote) selectCoupon();
  }

  function replaceCoupon(nextCouponCode: string) {
    setCouponCode(nextCouponCode);
    setQuoteState({ error: null, key: null, quote: null, status: QUOTE_STATUS.IDLE });
  }

  function removeCoupon() {
    setCouponCode("");
    setQuoteState({ error: null, key: null, quote: null, status: QUOTE_STATUS.IDLE });
  }

  return (
    <section className="space-y-[18px] border-t border-midnight-ink pt-[24px] text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]" aria-labelledby="coupon-selection-heading">
      <div>
        <h3 id="coupon-selection-heading" className="font-sans font-normal text-[20px]">Promociones y cupón</h3>
        <p className="mt-[6px] text-[15px] font-sans text-midnight-ink">
          Cotizá un cupón sin reservarlo. La selección final se valida nuevamente al iniciar el pago.
        </p>
      </div>

      <div className="flex flex-col gap-[6px] sm:flex-row sm:flex-wrap">
        <label className="sr-only" htmlFor="coupon-code">Código de cupón</label>
        <input
          id="coupon-code"
          value={couponCode}
          onChange={(event) => replaceCoupon(event.target.value)}
          disabled={isLoading}
          placeholder="Código de cupón"
          className="min-w-0 flex-1 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal uppercase focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {couponCode ? (
          <button type="button" onClick={removeCoupon} disabled={isLoading} className="inline-flex min-h-[36px] items-center justify-center gap-[6px] border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[13px] font-mono font-normal uppercase hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            <X size={14} /> Quitar
          </button>
        ) : null}
        <button type="button" onClick={() => void requestQuote()} disabled={isLoading || couponCode.trim() === "" || items.length === 0} className="min-h-[36px] border border-midnight-ink bg-midnight-ink px-[6px] py-[2px] text-[13px] font-mono font-normal uppercase text-bone-white hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          {isLoading ? <Loader2 className="mx-auto h-[16px] w-[16px] animate-spin" /> : "Cotizar"}
        </button>
      </div>

      {error ? <p role="alert" className="text-[13px] font-sans text-midnight-ink border-l border-dotted border-midnight-ink pl-[6px]">{error}</p> : null}

      {quote ? (
        <fieldset className="min-w-0 space-y-[13px] border border-midnight-ink bg-warm-sand p-[13px]" aria-describedby="coupon-selection-note">
          <legend className="px-[6px] text-[13px] font-mono font-normal">Elegí cómo aplicar tu descuento</legend>
          <p id="coupon-selection-note" className="text-[15px] font-sans text-midnight-ink">
            Sin una selección explícita se conservan las promociones. El cupón y las promociones no se combinan.
          </p>
          <label className="flex cursor-pointer items-start gap-[13px] border border-midnight-ink bg-bone-white p-[13px] has-[:checked]:bg-warm-sand">
            <input type="radio" name="pricing-source" checked={couponSource !== CUSTOMER_COUPON_SOURCES.COUPON} onChange={clearCouponSelection} className="mt-[2px] size-[16px] shrink-0 accent-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2" />
            <span className="min-w-0 flex-1 text-[15px] font-sans">
              <span className="block font-mono text-[13px] font-normal">Promociones</span>
              <span className="block text-midnight-ink">Descuento: {formatQuoteCents(quote.promotionDiscountCents)} · Total con envío: {formatQuoteCents(quote.promotionsPayableCents)}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-[13px] border border-midnight-ink bg-bone-white p-[13px] has-[:checked]:bg-warm-sand">
            <input type="radio" name="pricing-source" checked={couponSource === CUSTOMER_COUPON_SOURCES.COUPON} onChange={() => void selectCouponQuote()} disabled={isLoading} className="mt-[2px] size-[16px] shrink-0 accent-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
            <span className="min-w-0 flex-1 text-[15px] font-sans">
              <span className="block font-mono text-[13px] font-normal">Usar cupón {couponCode.trim().toUpperCase()}</span>
              <span className="block text-midnight-ink">Descuento: {formatQuoteCents(quote.couponDiscountCents)} · Total con envío: {formatQuoteCents(quote.couponPayableCents)}</span>
            </span>
          </label>
        </fieldset>
      ) : null}
    </section>
  );
}
