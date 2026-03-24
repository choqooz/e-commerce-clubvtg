"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export default function CheckoutPendingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-20 px-6">
          <Clock className="w-16 h-16 text-yellow-500 mb-6" />
          <h1 className="font-heading text-4xl mb-4">Pago Pendiente</h1>
          <p className="text-muted-foreground font-sans mb-8">
            Tu pago está siendo procesado por MercadoPago (por ejemplo, si pagaste en efectivo en Rapipago o PagoFácil).
            Una vez que se acredite, te enviaremos un email con la confirmación.
          </p>
          <Link 
            href="/"
            className="w-full bg-primary text-primary-foreground py-4 text-sm uppercase tracking-widest font-sans font-medium hover:opacity-90 transition-opacity"
          >
            Volver a la tienda
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
