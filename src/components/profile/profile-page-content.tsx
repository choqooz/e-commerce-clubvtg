"use client";

import { useClerk } from "@clerk/nextjs";
import { ChevronRight, Sparkles, ShoppingBag, Store, CreditCard, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TryOnHistory } from "@/components/try-on/try-on-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { TryOnHistoryItem } from "@/lib/actions/credits";

interface ProfileUser {
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string;
  emailVerified: boolean;
}

interface ProfilePageContentProps {
  user: ProfileUser;
  credits: number;
  tryOnHistory: TryOnHistoryItem[];
}

export function ProfilePageContent({ user, credits, tryOnHistory }: ProfilePageContentProps) {
  const { openUserProfile } = useClerk();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Usuario";

  return (
    <div className="min-h-screen bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]">
      <SiteHeader />
      <CartDrawer />

      <main>
        {/* Breadcrumb */}
        <div className="w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]">
          <nav className="flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono md:mx-auto md:max-w-[1200px]">
            <Link
              href="/"
              className="inline-flex min-h-[48px] items-center hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Mi Perfil</span>
          </nav>
        </div>

        <div className="w-full px-[18px] pb-[42px] md:px-[30px]">
          <div className="sr-only md:not-sr-only md:mx-auto md:mb-[18px] md:max-w-[1200px]">
            <h1 className="font-sans text-[48px] font-normal leading-[1.2]">Mi cuenta</h1>
            <p className="mt-[12px] font-sans text-[15px] leading-[1.5]">
              Gestioná tus datos, pedidos y créditos
            </p>
          </div>
          <div className="mx-auto grid min-w-0 max-w-[1200px] gap-[30px] lg:grid-cols-12 lg:gap-x-[42px] lg:gap-y-[42px]">
            {/* Section 1: User Info */}
            <header className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-start gap-[18px] pt-0 pb-[24px] md:pt-0 lg:col-span-12 lg:gap-[30px] lg:pb-[42px]">
              <Image
                src={user.imageUrl}
                alt={displayName}
                width={96}
                height={96}
                className="size-[96px] rounded-full object-cover row-span-1 md:row-span-2"
              />
              <div className="min-w-0 max-w-full space-y-[12px]">
                <h2 className="break-words font-sans text-[30px] font-normal leading-[1.2] sm:text-[36px] lg:text-[48px]">
                  {displayName}
                </h2>
                <p className="break-all font-sans text-[15px] leading-[1.5] text-midnight-ink">
                  {user.email}
                </p>
                {user.emailVerified ? (
                  <Badge className="min-w-0 max-w-full whitespace-normal break-words bg-warm-sand text-midnight-ink border-midnight-ink">
                    Email verificado
                  </Badge>
                ) : (
                  <Badge className="min-w-0 max-w-full whitespace-normal break-words bg-bone-white text-midnight-ink border-midnight-ink">
                    Verificar email
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="col-span-2 col-start-1 row-start-2 h-auto min-h-[48px] min-w-0 max-w-full w-fit justify-self-center whitespace-normal break-words px-[12px] py-[12px] leading-[1.5] md:col-span-1 md:col-start-2 md:justify-self-start"
                onClick={() => openUserProfile()}
              >
                <Settings className="size-[16px] mr-[6px]" />
                Gestionar cuenta
              </Button>
            </header>

            <Separator className="lg:col-span-12" />

            {/* Section 2: Credits */}
            <section
              aria-labelledby="profile-balance-heading"
              className="min-w-0 space-y-[24px] bg-warm-sand p-[24px] lg:col-span-5 lg:p-[36px]"
            >
              <div className="inline-flex size-[48px] items-center justify-center border border-midnight-ink">
                <Sparkles className="size-[24px] text-midnight-ink" />
              </div>
              <div>
                <h2
                  id="profile-balance-heading"
                  className="mb-[12px] font-mono text-[13px] font-normal text-midnight-ink"
                >
                  Tu balance
                </h2>
                <p className="flex flex-wrap items-baseline gap-[12px] font-sans text-[60px] font-normal leading-[1.1] sm:text-[72px]">
                  {credits}
                  <span className="text-[15px] text-midnight-ink">
                    {credits === 1 ? "crédito" : "créditos"}
                  </span>
                </p>
              </div>
              <p className="max-w-[30ch] font-sans text-[15px] leading-[1.5] text-midnight-ink">
                Cada prueba virtual consume 1 crédito
              </p>
              <Button
                asChild
                className="min-h-[48px] w-full whitespace-normal px-[18px] py-[12px] sm:w-fit"
              >
                <Link href="/credits">Comprar más créditos</Link>
              </Button>
            </section>

            <Separator className="lg:hidden" />

            {/* Section 3: Quick Links */}
            <section
              aria-labelledby="profile-links-heading"
              className="min-w-0 space-y-[24px] lg:col-span-7 lg:py-[24px]"
            >
              <h2
                id="profile-links-heading"
                className="font-sans text-[24px] font-normal leading-[1.2] text-midnight-ink"
              >
                Accesos rápidos
              </h2>
              <nav className="divide-y divide-midnight-ink border-y border-midnight-ink">
                <QuickLink
                  href="/orders"
                  icon={<ShoppingBag className="size-[16px]" />}
                  label="Mis Pedidos"
                />
                <QuickLink href="/" icon={<Store className="size-[16px]" />} label="Catálogo" />
                <QuickLink
                  href="/credits"
                  icon={<CreditCard className="size-[16px]" />}
                  label="Créditos"
                />
              </nav>
            </section>

            <Separator className="lg:col-span-12" />

            {/* Section 4: Try-On History */}
            <section
              aria-labelledby="profile-history-heading"
              className="min-w-0 space-y-[30px] lg:col-span-12"
            >
              <h2
                id="profile-history-heading"
                className="font-sans text-[30px] font-normal leading-[1.2] text-midnight-ink"
              >
                Mis pruebas virtuales
              </h2>
              <TryOnHistory items={tryOnHistory} />
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[60px] items-center justify-between gap-[18px] px-[18px] py-[18px] hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
    >
      <span className="flex items-center gap-[13px] text-[13px] font-mono">
        {icon}
        {label}
      </span>
      <ChevronRight size={16} className="text-midnight-ink shrink-0" />
    </Link>
  );
}
