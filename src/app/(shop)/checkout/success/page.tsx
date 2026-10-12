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
  const order = await getOwnedProductReturnOrderForCurrentUser(
    typeof orderId === "string" ? orderId : null,
  );
  const outcome = getProductReturnOutcome(order);

  if (outcome !== PRODUCT_RETURN_OUTCOME.SUCCESS || typeof orderId !== "string") {
    redirect(`/checkout/${outcome}`);
  }
  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3] flex flex-col">
      {isAuthoritativelyPaidProductReturn(order) && (
        <CartClearOnAuthoritativePayment orderId={orderId} />
      )}
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-[18px] py-[42px] md:px-[30px] md:py-[72px]">
        <div className="flex w-full max-w-[768px] flex-col items-start justify-center mx-auto border border-midnight-ink bg-warm-sand p-[24px] sm:p-[48px] text-left">
          <CheckCircle2 className="w-[42px] h-[42px] text-midnight-ink mb-[36px]" />
          <h1 className="max-w-[12ch] font-sans font-normal text-[42px] sm:text-[60px] leading-[1] mb-[24px]">
            ¡Pago Exitoso!
          </h1>
          <p className="max-w-[48ch] text-midnight-ink font-sans text-[18px] leading-[1.5] mb-[42px]">
            Tu orden ha sido confirmada y está siendo procesada. En breve recibirás un email con los
            detalles del envío por Correo Argentino.
          </p>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex min-h-[48px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[12px] px-[24px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          >
            Volver a la tienda
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
