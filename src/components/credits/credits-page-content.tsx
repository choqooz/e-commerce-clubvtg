"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronRight, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CartDrawer from "@/components/cart-drawer";
import { CreditBalance } from "@/components/credits/credit-balance";
import { CreditPackCard } from "@/components/credits/credit-pack-card";
import { CREDIT_PACKS } from "@/lib/config";
import { createCreditPackPreference } from "@/lib/actions/credits";
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <Link
              href="/"
              className="hover:text-foreground transition-colors"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span className="text-foreground">Créditos</span>
          </nav>
        </div>

        <div className="container mx-auto px-6 pb-16">
          <div className="max-w-3xl mx-auto space-y-10">
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center size-14 rounded-full bg-primary/10">
                <Sparkles className="size-7 text-primary" />
              </div>
              <h1 className="text-3xl font-heading font-medium tracking-wide">
                Tu balance
              </h1>
              <div className="flex justify-center">
                <CreditBalance credits={initialCredits} />
              </div>
            </div>

            {/* Credit Packs */}
            <div className="space-y-4">
              <h2 className="text-lg font-heading font-medium tracking-wide text-center">
                Comprá créditos
              </h2>
              <p className="text-sm text-muted-foreground text-center">
                Cada crédito te permite generar una prueba virtual de cualquier
                prenda.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
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
            <div className="rounded-lg border bg-muted/30 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">
                  ¿Cómo funcionan los créditos?
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground shrink-0">1.</span>
                  Comprá un pack de créditos con MercadoPago.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground shrink-0">2.</span>
                  Elegí una prenda de la tienda y hacé clic en &quot;Probate esta prenda&quot;.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground shrink-0">3.</span>
                  Subí una foto tuya y nuestra IA genera una prueba virtual.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground shrink-0">4.</span>
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
