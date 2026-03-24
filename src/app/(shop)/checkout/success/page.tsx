"use client";

import { useEffect, Suspense } from "react";
import { useCart } from "@/contexts/cart-context";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

function SuccessContent() {
  const { clearCart } = useCart();

  useEffect(() => {
    // Clear the cart once the user lands on the success page
    clearCart();
  }, [clearCart]);

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-20 px-6">
      <CheckCircle2 className="w-16 h-16 text-primary mb-6" />
      <h1 className="font-heading text-4xl mb-4">¡Pago Exitoso!</h1>
      <p className="text-muted-foreground font-sans mb-8">
        Tu orden ha sido confirmada y está siendo procesada. 
        En breve recibirás un email con los detalles del envío por Correo Argentino.
      </p>
      <Link 
        href="/"
        className="w-full bg-primary text-primary-foreground py-4 text-sm uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-opacity"
      >
        Volver a la tienda
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center">
        <Suspense fallback={<div className="font-sans">Cargando...</div>}>
          <SuccessContent />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
