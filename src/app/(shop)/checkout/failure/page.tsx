"use client";

import Link from "next/link";
import { XCircle } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export default function CheckoutFailurePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-20 px-6">
          <XCircle className="w-16 h-16 text-destructive mb-6" />
          <h1 className="font-heading text-4xl mb-4">Pago Rechazado</h1>
          <p className="text-muted-foreground font-sans mb-8">
            Hubo un problema procesando tu pago en MercadoPago. 
            Por favor, verificá tus datos o intentá con otro medio de pago.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <Link 
              href="/checkout"
              className="flex-1 bg-primary text-primary-foreground py-4 text-sm uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-opacity"
            >
              Reintentar
            </Link>
            <Link 
              href="/"
              className="flex-1 border border-border bg-transparent text-foreground py-4 text-sm uppercase tracking-widest font-sans font-medium hover:bg-secondary/50 transition-colors"
            >
              Volver a la tienda
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
