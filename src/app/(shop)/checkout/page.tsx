"use client";

import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { CheckoutForm } from "@/components/checkout-form";
import { formatPrice, SHIPPING_FEE } from "@/lib/config";
import Link from "next/link";
import { ChevronRight, ArrowLeft } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <Link href="/" className="hover:text-foreground transition-colors">
              Inicio
            </Link>
            <ChevronRight size={12} />
            <Link href="/cart" className="hover:text-foreground transition-colors">
              Carrito
            </Link>
            <ChevronRight size={12} />
            <span className="text-foreground">Checkout</span>
          </nav>
        </div>

        <div className="container mx-auto px-6 pb-16 pt-8">
          <div className="flex items-center mb-10">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm font-sans uppercase tracking-widest font-medium">
              <ArrowLeft size={16} />
              Seguir Comprando
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Col: Form */}
            <div className="lg:col-span-7 xl:col-span-8">
              <div className="mb-8">
                <h1 className="font-heading text-3xl font-light mb-2">Finalizar Compra</h1>
                <p className="text-muted-foreground font-sans text-sm">Completá tus datos para el envío y pago.</p>
              </div>

              {items.length > 0 ? (
                <CheckoutForm />
              ) : (
                <div className="border border-border p-8 text-center bg-secondary/30">
                  <p className="text-muted-foreground font-sans mb-4">No tenés productos en el carrito.</p>
                  <Link 
                    href="/"
                    className="inline-block bg-primary text-primary-foreground py-3 px-8 text-sm uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-opacity"
                  >
                    Ir al Catálogo
                  </Link>
                </div>
              )}
            </div>

            {/* Right Col: Summary */}
            <div className="lg:col-span-5 xl:col-span-4 sticky top-24">
              <div className="border border-border p-6 bg-secondary/20">
                <h2 className="font-heading text-xl mb-6">Resumen de la Orden</h2>
                
                <div className="space-y-4 mb-6">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex gap-4">
                      {/* Product image */}
                      <div className="relative w-16 h-20 bg-secondary shrink-0 overflow-hidden">
                        {item.product.image_urls && item.product.image_urls.length > 0 ? (
                          <Image
                            src={item.product.image_urls[0]}
                            alt={item.product.title}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest">
                              {item.product.category}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-sans truncate font-medium">
                          {item.product.title}
                        </h4>
                        <p className="text-[10px] text-muted-foreground font-sans mt-0.5 uppercase tracking-wider">
                          Talle {item.product.size || "Único"}
                        </p>
                        <p className="text-sm font-sans mt-1">
                          {formatPrice(item.product.price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-4 space-y-3 font-sans text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Envío (Correo Argentino)</span>
                    <span>{formatPrice(SHIPPING_FEE)}</span>
                  </div>
                  
                  <div className="flex justify-between font-medium text-base pt-3 border-t border-border/50">
                    <span>Total</span>
                    <span>{formatPrice(totalPrice + SHIPPING_FEE)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
