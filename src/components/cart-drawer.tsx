"use client";

import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/config";
import Link from "next/link";

export default function CartDrawer() {
  const { items, removeItem, totalItems, totalPrice, isOpen, setIsOpen } =
    useCart();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md bg-background border-border flex flex-col">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-heading text-xl font-normal tracking-wide">
            Carrito ({totalItems})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground font-sans">
              Tu carrito está vacío
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {items.map((item) => (
                <div key={item.product.id} className="flex gap-4 animate-in fade-in slide-in-from-right-2 duration-200">
                  {/* Product image */}
                  <div className="relative w-20 h-24 bg-secondary shrink-0 flex items-center justify-center overflow-hidden">
                    {item.product.image_urls && item.product.image_urls.length > 0 ? (
                      <Image
                        src={item.product.image_urls[0]}
                        alt={item.product.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest">
                        {item.product.category}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-sans truncate">
                      {item.product.title}
                    </h4>
                    <p className="text-xs text-muted-foreground font-sans mt-0.5">
                      {item.product.color} · Talle {item.product.size}
                    </p>
                    <p className="text-sm font-sans mt-1">
                      {formatPrice(item.product.price)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors duration-200 self-start p-1 hover:bg-destructive/10"
                    aria-label="Quitar producto"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex justify-between text-sm font-sans">
                <span>Total</span>
                <span className="font-medium">{formatPrice(totalPrice)}</span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setIsOpen(false)}
                className="w-full bg-primary text-primary-foreground py-3.5 text-sm uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-all duration-200 text-center block"
              >
                Ir al Checkout
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
