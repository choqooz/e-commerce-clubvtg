import Link from "next/link";
import type { ReactNode } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-bone-white text-midnight-ink">
      <SiteHeader />
      <CartDrawer />
      <main className="w-full min-w-0 flex-1">
        <div className="w-full px-[18px] pt-[18px] pb-[6px] md:px-[30px] md:pb-[12px]">
          <nav
            aria-label="Navegación de pedidos"
            className="flex min-h-[48px] flex-wrap items-center gap-[6px] text-[13px] text-midnight-ink font-mono md:mx-auto md:max-w-[1200px]"
          >
            <Link
              href="/profile"
              className="inline-flex min-h-[48px] items-center hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Mi Cuenta
            </Link>
            <span aria-hidden="true">→</span>
            <span aria-current="page">Mis pedidos</span>
          </nav>
        </div>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
