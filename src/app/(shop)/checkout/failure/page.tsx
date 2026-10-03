import { XCircle } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CheckoutFailurePage() {
  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3] flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-[18px]">
        <div className="flex w-full flex-col items-center justify-center text-center max-w-[448px] mx-auto py-[42px] px-[13px]">
          <XCircle className="w-[42px] h-[42px] text-midnight-ink mb-[24px]" />
          <h1 className="font-sans font-normal text-[30px] leading-[1.2] mb-[18px]">Pago Rechazado</h1>
          <p className="text-midnight-ink font-sans mb-[30px]">
            Hubo un problema procesando tu pago en MercadoPago. Por favor, verificá tus datos o
            intentá con otro medio de pago.
          </p>
          <div className="flex flex-col sm:flex-row gap-[13px] w-full">
            <Link
              href="/checkout"
              className="flex-1 inline-flex min-h-[36px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[2px] px-[6px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Reintentar
            </Link>
            <Link
              href="/"
              className="flex-1 inline-flex min-h-[36px] items-center justify-center border border-midnight-ink bg-bone-white text-midnight-ink py-[2px] px-[6px] text-[13px] uppercase font-mono font-normal hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
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
