"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useAnalytics } from "@/contexts/analytics-context";
import { productAddedToCartEvent } from "@/lib/analytics-events";
import {
  CUSTOMER_COUPON_SOURCES,
  type CustomerCouponSource,
  replaceCouponCode,
} from "@/lib/coupon-choice";
import type { Product, CartItem } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  couponCode: string;
  couponSource: CustomerCouponSource | null;
  clearCouponSelection: () => void;
  getCouponQuoteVersion: () => number;
  isCouponQuoteVersionCurrent: (version: number) => boolean;
  setCouponCode: (couponCode: string) => void;
  selectCoupon: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  restoreCartFocus?: () => boolean;
  isHydrated: boolean;
}

type CartHeaderContextValue = Pick<CartContextValue, "totalItems" | "setIsOpen">;

const CartContext = createContext<CartContextValue | null>(null);
const CartHeaderContext = createContext<CartHeaderContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const posthog = useAnalytics();
  const [items, setItems] = useState<CartItem[]>([]);
  const [couponCode, setCouponCodeState] = useState("");
  const [couponSource, setCouponSource] = useState<CustomerCouponSource | null>(null);
  const couponQuoteVersionRef = useRef(0);
  const [isOpen, setOpenState] = useState(false);
  const openRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const openedAtRef = useRef("");
  const [isHydrated, setIsHydrated] = useState(false);

  const setIsOpen = useCallback((open: boolean) => {
    if (open && !openRef.current) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openedAtRef.current = window.location.href;
    }
    openRef.current = open;
    setOpenState(open);
  }, []);

  const restoreCartFocus = useCallback(() => {
    // Destination navigation owns focus, not the drawer that is being unmounted.
    if (openRef.current || openedAtRef.current !== window.location.href) return false;
    const fallback = document.querySelector<HTMLButtonElement>("header [data-cart-trigger]");
    for (const target of [openerRef.current, fallback]) {
      if (
        !target?.isConnected ||
        target.tabIndex < 0 ||
        !target.getClientRects().length ||
        target.closest('[inert], [aria-disabled="true"]') ||
        target.matches(":disabled")
      )
        continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return true;
    }
    return false;
  }, []);

  function invalidateCouponQuote() {
    couponQuoteVersionRef.current += 1;
  }

  function getCouponQuoteVersion() {
    return couponQuoteVersionRef.current;
  }

  function isCouponQuoteVersionCurrent(version: number) {
    return couponQuoteVersionRef.current === version;
  }

  // Hydrate from localStorage on client only.
  // setState in effect is intentional here — this synchronizes with an external
  // system (localStorage) to avoid SSR hydration mismatch. This is the canonical
  // Next.js pattern for client-only state restoration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("clubvtg-cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration requires effect + setState
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      // ignore corrupt data
    }
    setIsHydrated(true);
  }, []);

  // Persist to localStorage only after hydration
  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("clubvtg-cart", JSON.stringify(items));
  }, [items, isHydrated]);

  const addItem = useCallback(
    (product: Product) => {
      setItems((prev) => {
        // Single-stock: 1 unit per product, no duplicates
        const exists = prev.find((item) => item.product.id === product.id);
        if (exists) return prev;
        return [...prev, { product, quantity: 1 }];
      });
      invalidateCouponQuote();
      setCouponSource(null);
      setIsOpen(true);
      const event = productAddedToCartEvent(product);
      posthog?.capture(event.event, event.properties);
    },
    [posthog, setIsOpen],
  );

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
    invalidateCouponQuote();
    setCouponSource(null);
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCouponCodeState("");
    invalidateCouponQuote();
    setCouponSource(null);
  }, []);

  const setCouponCode = (nextCouponCode: string) => {
    const choice = replaceCouponCode(nextCouponCode);
    setCouponCodeState(choice.couponCode);
    invalidateCouponQuote();
    setCouponSource(choice.source);
  };

  const clearCouponSelection = () => {
    invalidateCouponQuote();
    setCouponSource(null);
  };
  const selectCoupon = () => setCouponSource(CUSTOMER_COUPON_SOURCES.COUPON);

  const totalItems = items.length;
  const totalPrice = items.reduce((sum, item) => sum + item.product.price, 0);
  const headerValue = useMemo(() => ({ totalItems, setIsOpen }), [totalItems, setIsOpen]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        couponCode,
        couponSource,
        clearCouponSelection,
        getCouponQuoteVersion,
        isCouponQuoteVersionCurrent,
        setCouponCode,
        selectCoupon,
        totalItems,
        totalPrice,
        isOpen,
        setIsOpen,
        restoreCartFocus,
        isHydrated,
      }}
    >
      <CartHeaderContext.Provider value={headerValue}>{children}</CartHeaderContext.Provider>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

export function useCartHeader() {
  const ctx = useContext(CartHeaderContext);
  if (!ctx) throw new Error("useCartHeader must be used inside <CartProvider>");
  return ctx;
}
