import { XCircle } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CheckoutFailurePage() {
  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3] flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-[18px] py-[42px] md:px-[30px] md:py-[72px]">
        <div className="flex w-full max-w-[768px] flex-col items-start justify-center mx-auto border border-midnight-ink bg-warm-sand p-[24px] sm:p-[48px] text-left">
          <XCircle className="w-[42px] h-[42px] text-midnight-ink mb-[36px]" />
          <h1 className="max-w-[12ch] font-sans font-normal text-[42px] sm:text-[60px] leading-[1] mb-[24px]">
            Pago Rechazado
          </h1>
          <p className="max-w-[48ch] text-midnight-ink font-sans text-[18px] leading-[1.5] mb-[42px]">
            Hubo un problema procesando tu pago en MercadoPago. Por favor, verificá tus datos o
            intentá con otro medio de pago.
          </p>
          <div className="flex w-full flex-col gap-[13px] sm:flex-row">
            <Link
              href="/checkout"
              className="flex-1 inline-flex min-h-[48px] items-center justify-center border border-midnight-ink bg-midnight-ink text-bone-white py-[12px] px-[24px] text-[13px] uppercase font-mono font-normal hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Reintentar
            </Link>
            <Link
              href="/"
              className="flex-1 inline-flex min-h-[48px] items-center justify-center border border-midnight-ink bg-bone-white text-midnight-ink py-[12px] px-[24px] text-[13px] uppercase font-mono font-normal hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
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
