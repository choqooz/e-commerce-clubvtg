"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Product, CartItem } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isHydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on client only
  useEffect(() => {
    try {
      const saved = localStorage.getItem("clubvtg-cart");
      if (saved) {
        const parsed = JSON.parse(saved);
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
      setIsOpen(true);
    },
    [],
  );

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.length;
  const totalPrice = items.reduce((sum, item) => sum + item.product.price, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        totalItems,
        totalPrice,
        isOpen,
        setIsOpen,
        isHydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
