import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CartClearOnAuthoritativePayment } from "@/components/cart-clear-on-authoritative-payment";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  PRODUCT_RETURN_OUTCOME,
  getOwnedProductReturnOrderForCurrentUser,
  getProductReturnOutcome,
  isAuthoritativelyPaidProductReturn,
} from "@/lib/payments/return-authority";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ order_id?: string | string[] }>;
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { order_id: orderId } = await searchParams;
  const order = await getOwnedProductReturnOrderForCurrentUser(typeof orderId === "string" ? orderId : null);
  const outcome = getProductReturnOutcome(order);

  if (outcome !== PRODUCT_RETURN_OUTCOME.SUCCESS || typeof orderId !== "string") {
    redirect(`/checkout/${outcome}`);
  }
  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3] flex flex-col">
      {isAuthoritativelyPaidProductReturn(order) && <CartClearOnAuthoritativePayment orderId={orderId} />}
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-[18px]">
        <div className="flex w-full flex-col items-center justify-center text-center max-w-[448px] mx-auto py-[42px] px-[13px]">
          <CheckCircle2 className="w-[42px] h-[42px] text-midnight-ink mb-[24px]" />
          <h1 className="font-sans font-normal text-[30px] leading-[1.2] mb-[18px]">¡Pago Exitoso!</h1>
          <p className="text-midnight-ink font-sans mb-[30px]">
            Tu orden ha sido confirmada y está siendo procesada. En breve recibirás un email con los
            detalles del envío por Correo Argentino.
          </p>
          <Link
            href="/"
            className="w-full inline-flex min-h-[36px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[2px] px-[6px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          >
            Volver a la tienda
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
