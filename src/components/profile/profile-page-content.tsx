"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  Sparkles,
  ShoppingBag,
  Store,
  CreditCard,
  Settings,
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import CartDrawer from "@/components/cart-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
}

export function ProfilePageContent({ user, credits }: ProfilePageContentProps) {
  const { openUserProfile } = useClerk();
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Usuario";

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
            <span className="text-foreground">Mi Perfil</span>
          </nav>
        </div>

        <div className="container mx-auto px-6 pb-16">
          <div className="max-w-2xl mx-auto space-y-10">
            {/* Section 1: User Info */}
            <div className="flex flex-col items-center space-y-4">
              <Image
                src={user.imageUrl}
                alt={displayName}
                width={96}
                height={96}
                className="rounded-full border border-border"
              />
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl font-heading font-medium tracking-wide">
                  {displayName}
                </h1>
                <p className="text-sm text-muted-foreground font-sans">
                  {user.email}
                </p>
                {user.emailVerified ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                    Email verificado
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                    Verificar email
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUserProfile()}
              >
                <Settings className="size-4 mr-1.5" />
                Gestionar cuenta
              </Button>
            </div>

            <Separator />

            {/* Section 2: Credits */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-sans mb-1">
                  Tu balance
                </p>
                <p className="text-4xl font-heading font-medium tracking-wide">
                  {credits}
                  <span className="text-lg text-muted-foreground ml-2">
                    {credits === 1 ? "crédito" : "créditos"}
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-sans">
                Cada prueba virtual consume 1 crédito
              </p>
              <Button asChild>
                <Link href="/credits">Comprar más créditos</Link>
              </Button>
            </div>

            <Separator />

            {/* Section 3: Quick Links */}
            <div className="space-y-2">
              <h2 className="text-sm uppercase tracking-widest font-sans font-medium text-muted-foreground mb-4">
                Accesos rápidos
              </h2>
              <nav className="space-y-1">
                <QuickLink
                  href="/orders"
                  icon={<ShoppingBag className="size-4" />}
                  label="Mis Pedidos"
                />
                <QuickLink
                  href="/"
                  icon={<Store className="size-4" />}
                  label="Catálogo"
                />
                <QuickLink
                  href="/credits"
                  icon={<CreditCard className="size-4" />}
                  label="Créditos"
                />
              </nav>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 border border-border hover:bg-muted/50 transition-colors group"
    >
      <span className="flex items-center gap-3 text-sm font-sans">
        {icon}
        {label}
      </span>
      <ChevronRight
        size={16}
        className="text-muted-foreground group-hover:text-foreground transition-colors"
      />
    </Link>
  );
}
