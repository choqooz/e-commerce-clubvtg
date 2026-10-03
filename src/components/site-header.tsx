"use client";

import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";
import { Search, ShoppingBag, Sparkles, User, Package, CreditCard } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useCart } from "@/contexts/cart-context";
import { getUserCredits } from "@/lib/actions/credits";

function CreditBadge() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    getUserCredits().then((result) => {
      if (result) setCredits(result.credits);
    });
  }, []);

  if (credits === null) return null;

  return (
    <Link
      href="/credits"
      className="flex min-h-[36px] items-center gap-[6px] font-mono text-[13px] font-normal text-midnight-ink hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
    >
      <Sparkles size={14} strokeWidth={1.5} />
      <span>{credits}</span>
    </Link>
  );
}

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { totalItems, setIsOpen } = useCart();
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-midnight-ink bg-bone-white font-sans font-normal text-midnight-ink">
      {/* Announcement bar */}
      <div className="border-b border-midnight-ink px-[18px] py-[11px] text-center font-mono text-[13px] leading-[1.2] font-normal uppercase">
        Envío a todo el país · Correo Argentino
      </div>

      <div className="px-[18px] md:px-[24px]">
        <div className="relative flex min-h-[72px] items-center justify-between gap-[13px] py-[18px]">
          {/* Nav links (desktop) */}
          <nav className="hidden items-center gap-[30px] md:flex">
            <Link
              href="/"
              className="font-mono text-[13px] font-normal hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              Catálogo
            </Link>
          </nav>

          {/* Wordmark stays in flow on mobile so controls cannot overlap it. */}
          <Link
            href="/"
            className="shrink-0 md:absolute md:left-1/2 md:-translate-x-1/2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
          >
            <h1 className="font-sans text-[20px] leading-[1.3] font-normal">clubvtg</h1>
          </Link>

          {/* Right icons */}
          <div className="ml-auto flex items-center gap-[6px] sm:gap-[13px] md:gap-[18px]">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex h-[36px] w-[28px] items-center justify-center text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              aria-label="Buscar"
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            {/* Clerk Auth: the managed control and appearance remain unchanged. */}
            {isSignedIn ? (
              <>
                <CreditBadge />
                <div className="flex min-h-[36px] items-center">
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "w-7 h-7",
                      },
                    }}
                  >
                    <UserButton.MenuItems>
                      <UserButton.Link
                        label="Mi Perfil"
                        labelIcon={<User size={16} />}
                        href="/profile"
                      />
                      <UserButton.Link
                        label="Mis Pedidos"
                        labelIcon={<Package size={16} />}
                        href="/orders"
                      />
                      <UserButton.Link
                        label="Créditos"
                        labelIcon={<CreditCard size={16} />}
                        href="/credits"
                      />
                      <UserButton.Action label="manageAccount" />
                      <UserButton.Action label="signOut" />
                    </UserButton.MenuItems>
                  </UserButton>
                </div>
              </>
            ) : (
              <SignInButton mode="modal">
                <button
                  className="min-h-[36px] px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase text-midnight-ink hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                  aria-label="Iniciar sesión"
                >
                  Entrar
                </button>
              </SignInButton>
            )}

            <button
              onClick={() => setIsOpen(true)}
              className="relative flex h-[36px] w-[36px] items-center justify-center text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              aria-label="Carrito"
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              {totalItems > 0 && (
                <span className="absolute -top-[2px] -right-[2px] flex min-h-[18px] min-w-[18px] items-center justify-center border border-midnight-ink bg-bone-white px-[2px] font-mono text-[13px] font-normal">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search bar (expandable, no search behavior is introduced). */}
        {searchOpen && (
          <div className="pb-[18px]">
            <input
              type="text"
              placeholder="Buscar prendas..."
              className="h-[36px] w-full rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-sans text-[16px] font-normal text-midnight-ink placeholder:text-concrete-gray md:text-[15px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              autoFocus
            />
          </div>
        )}
      </div>
    </header>
  );
}
