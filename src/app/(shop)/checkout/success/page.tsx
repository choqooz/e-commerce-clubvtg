import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PRODUCT_RETURN_OUTCOME, getOwnedProductReturnOutcome } from "@/lib/payments/return-authority";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ order_id?: string | string[] }>;
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { order_id: orderId } = await searchParams;
  const outcome = await getOwnedProductReturnOutcome(typeof orderId === "string" ? orderId : null);

  if (outcome !== PRODUCT_RETURN_OUTCOME.SUCCESS || typeof orderId !== "string") {
    redirect(`/checkout/${outcome}`);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-20 px-6">
          <CheckCircle2 className="w-16 h-16 text-primary mb-6" />
          <h1 className="font-heading text-4xl mb-4">¡Pago Exitoso!</h1>
          <p className="text-muted-foreground font-sans mb-8">
            Tu orden ha sido confirmada y está siendo procesada. En breve recibirás un email con los
            detalles del envío por Correo Argentino.
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
