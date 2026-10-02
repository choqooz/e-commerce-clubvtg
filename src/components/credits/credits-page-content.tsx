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
          <nav className="flex flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono">
            <Link href="/" className="hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2">
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Créditos</span>
          </nav>
        </div>

        <div className="w-full px-[18px] pb-[42px] md:px-[30px]">
          <div className="max-w-[896px] min-w-0 mx-auto space-y-[42px]">
            {/* Header */}
            <div className="text-center space-y-[13px]">
              <div className="inline-flex items-center justify-center size-[56px] bg-warm-sand">
                <Sparkles className="size-[28px] text-midnight-ink" />
              </div>
              <h1 className="text-[30px] leading-[1.2] font-sans font-normal">Tu balance</h1>
              <div className="flex justify-center">
                <CreditBalance credits={initialCredits} className="gap-[6px] font-mono text-[13px] font-normal tracking-normal text-midnight-ink hover:text-midnight-ink [&_svg]:opacity-100" />
              </div>
            </div>

            {/* Credit Packs */}
            <div className="space-y-[18px]">
              <h2 className="text-[20px] font-sans font-normal text-center">
                Comprá créditos
              </h2>
              <p className="text-[15px] text-midnight-ink text-center">
                Cada crédito te permite generar una prueba virtual de cualquier prenda.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] pt-[13px]">
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
            </div>

            {/* How credits work */}
            <div className="border border-midnight-ink bg-warm-sand p-[13px] md:p-[24px] space-y-[13px]">
              <div className="flex items-center gap-[6px]">
                <HelpCircle className="size-[16px] text-midnight-ink shrink-0" />
                <h3 className="text-[13px] font-mono font-normal">¿Cómo funcionan los créditos?</h3>
              </div>
              <ul className="space-y-[6px] text-[15px] text-midnight-ink">
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">1.</span>
                  Comprá un pack de créditos con MercadoPago.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">2.</span>
                  Elegí una prenda de la tienda y hacé clic en &quot;Probate esta prenda&quot;.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">3.</span>
                  Subí una foto tuya y nuestra IA genera una prueba virtual.
                </li>
                <li className="flex items-start gap-[6px]">
                  <span className="font-mono text-[13px] font-normal text-midnight-ink shrink-0">4.</span>
                  Se descuenta 1 crédito por cada generación.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
