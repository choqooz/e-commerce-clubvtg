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
        <div className="w-full px-[18px] py-[18px] md:px-[30px]">
          <nav className="flex flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono">
            <Link href="/" className="hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2">
              Inicio
            </Link>
            <ChevronRight size={12} />
            <span className="text-midnight-ink">Mi Perfil</span>
          </nav>
        </div>

        <div className="w-full px-[18px] pb-[42px] md:px-[30px]">
          <div className="max-w-[672px] min-w-0 mx-auto space-y-[42px]">
            {/* Section 1: User Info */}
            <div className="flex flex-col items-center space-y-[18px]">
              <Image
                src={user.imageUrl}
                alt={displayName}
                width={96}
                height={96}
                className="size-[96px] rounded-none object-cover"
              />
              <div className="min-w-0 max-w-full text-center space-y-[6px]">
                <h1 className="text-[30px] leading-[1.2] font-sans font-normal break-words">{displayName}</h1>
                <p className="text-[15px] text-midnight-ink font-sans break-words">{user.email}</p>
                {user.emailVerified ? (
                  <Badge className="bg-warm-sand text-midnight-ink border-midnight-ink">
                    Email verificado
                  </Badge>
                ) : (
                  <Badge className="bg-bone-white text-midnight-ink border-midnight-ink">
                    Verificar email
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
                <Settings className="size-[16px] mr-[6px]" />
                Gestionar cuenta
              </Button>
            </div>

            <Separator />

            {/* Section 2: Credits */}
            <div className="text-center space-y-[18px]">
              <div className="inline-flex items-center justify-center size-[48px] bg-warm-sand">
                <Sparkles className="size-[24px] text-midnight-ink" />
              </div>
              <div>
                <p className="text-[13px] text-midnight-ink font-mono mb-[6px]">Tu balance</p>
                <p className="text-[30px] font-sans font-normal">
                  {credits}
                  <span className="text-[15px] text-midnight-ink ml-[6px]">
                    {credits === 1 ? "crédito" : "créditos"}
                  </span>
                </p>
              </div>
              <p className="text-[15px] text-midnight-ink font-sans">
                Cada prueba virtual consume 1 crédito
              </p>
              <Button asChild>
                <Link href="/credits">Comprar más créditos</Link>
              </Button>
            </div>

            <Separator />

            {/* Section 3: Quick Links */}
            <div className="space-y-[6px]">
              <h2 className="text-[13px] uppercase font-mono font-normal text-midnight-ink mb-[18px]">
                Accesos rápidos
              </h2>
              <nav className="space-y-[6px]">
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
            </div>

            <Separator />

            {/* Section 4: Try-On History */}
            <div className="space-y-[18px]">
              <h2 className="text-[13px] uppercase font-mono font-normal text-midnight-ink">
                Mis pruebas virtuales
              </h2>
              <TryOnHistory items={tryOnHistory} />
            </div>
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
      className="flex min-h-[36px] items-center justify-between gap-[13px] px-[13px] py-[13px] border border-midnight-ink hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
    >
      <span className="flex items-center gap-[13px] text-[13px] font-mono">
        {icon}
        {label}
      </span>
      <ChevronRight
        size={16}
        className="text-midnight-ink shrink-0"
      />
    </Link>
  );
}
