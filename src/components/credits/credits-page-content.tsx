"use client";

import { Sparkles, ChevronRight, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { CartDrawer } from "@/components/cart-drawer";
import { CreditBalance } from "@/components/credits/credit-balance";
import { CreditPackCard } from "@/components/credits/credit-pack-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createCreditPackPreference } from "@/lib/actions/credits";
import { CREDIT_PACKS } from "@/lib/config";
import type { CreditPackId } from "@/lib/types";

interface CreditsPageContentProps {
  initialCredits: number;
}

export function CreditsPageContent({ initialCredits }: CreditsPageContentProps) {
  const router = useRouter();
  const [loadingPack, setLoadingPack] = useState<CreditPackId | null>(null);

  const handleSelectPack = useCallback(
    async (packId: CreditPackId) => {
      setLoadingPack(packId);

      try {
        const result = await createCreditPackPreference(packId);

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        // Redirect to MercadoPago
        router.push(result.url);
      } catch {
        toast.error("Error al crear la preferencia de pago. Intentá de nuevo.");
      } finally {
        setLoadingPack(null);
      }
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="w-full px-[18px] py-[18px] md:px-[30px]">
          <nav className="flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono md:mx-auto md:max-w-[1200px]">
            <Link
              href="/"
              className="inline-flex min-h-[48px] items-center hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Créditos</span>
          </nav>
        </div>

        <div className="w-full px-[18px] pb-[42px] md:px-[30px]">
          <div className="mx-auto min-w-0 max-w-[1200px] space-y-[42px] lg:space-y-[60px]">
            {/* Balance leads the page; pack comparison stays a separate surface. */}
            <header
              aria-labelledby="credits-balance-heading"
              className="grid min-w-0 gap-[24px] border-y border-midnight-ink bg-warm-sand p-[24px] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-[30px] md:p-[36px]"
            >
              <div className="inline-flex size-[48px] items-center justify-center border border-midnight-ink">
                <Sparkles className="size-[24px] text-midnight-ink" />
              </div>
              <h1
                id="credits-balance-heading"
                className="break-words font-sans text-[36px] font-normal leading-[1.1] sm:text-[48px] lg:text-[60px]"
              >
                Tu balance
              </h1>
              <div className="flex min-w-0 md:justify-end">
                <CreditBalance
                  credits={initialCredits}
                  className="gap-[12px] font-sans text-[60px] font-normal leading-[1.1] tracking-normal text-midnight-ink sm:text-[72px] [&_svg]:size-[24px] [&_svg]:opacity-100"
                />
              </div>
            </header>

            {/* Credit Packs */}
            <section aria-labelledby="credits-packs-heading" className="space-y-[24px]">
              <h2
                id="credits-packs-heading"
                className="font-sans text-[30px] font-normal leading-[1.2] sm:text-[36px]"
              >
                Comprá créditos
              </h2>
              <p className="max-w-[55ch] font-sans text-[15px] leading-[1.5] text-midnight-ink">
                Cada crédito te permite generar una prueba virtual de cualquier prenda.
              </p>

              <div className="grid min-w-0 grid-cols-1 gap-[24px] pt-[18px] md:grid-cols-3">
                {CREDIT_PACKS.map((pack) => (
                  <CreditPackCard
                    key={pack.id}
                    packId={pack.id as CreditPackId}
                    name={pack.name}
                    credits={pack.credits}
                    price={pack.price}
                    popular={pack.popular}
                    onSelect={handleSelectPack}
                    loading={loadingPack === pack.id}
                  />
                ))}
              </div>
            </section>

            {/* Keep the existing instructions in a quiet, readable editorial band. */}
            <section
              aria-labelledby="credits-help-heading"
              className="max-w-[896px] space-y-[24px] border-t border-midnight-ink pt-[30px]"
            >
              <div className="flex items-start gap-[12px]">
                <HelpCircle className="mt-[3px] size-[18px] shrink-0 text-midnight-ink" />
                <h2
                  id="credits-help-heading"
                  className="font-sans text-[24px] font-normal leading-[1.3]"
                >
                  ¿Cómo funcionan los créditos?
                </h2>
              </div>
              <ul className="space-y-[18px] text-[15px] leading-[1.5] text-midnight-ink">
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">
                    1.
                  </span>
                  Comprá un pack de créditos con MercadoPago.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">
                    2.
                  </span>
                  Elegí una prenda de la tienda y hacé clic en &quot;Probate esta prenda&quot;.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">
                    3.
                  </span>
                  Subí una foto tuya y nuestra IA genera una prueba virtual.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">
                    4.
                  </span>
                  Se descuenta 1 crédito por cada generación.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
