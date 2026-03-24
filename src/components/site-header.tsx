"use client";

import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/contexts/cart-context";
import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";

export default function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { totalItems, setIsOpen } = useCart();
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground text-center py-2 text-xs tracking-widest uppercase font-sans">
        Envío a todo el país · Correo Argentino
      </div>

      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="nav-link nav-link-active">
              Catálogo
            </Link>
            <Link href="/" className="nav-link">
              Novedades
            </Link>
          </nav>

          {/* Logo (centered) */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <h1 className="font-heading text-2xl tracking-wider font-medium">
              clubvtg
            </h1>
          </Link>

          {/* Right icons */}
          <div className="flex items-center gap-5 ml-auto">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-foreground/70 hover:text-foreground transition-colors"
              aria-label="Buscar"
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            {/* Clerk Auth */}
            {isSignedIn ? (
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-7 h-7",
                  },
                }}
              />
            ) : (
              <SignInButton mode="modal">
                <button
                  className="text-xs uppercase tracking-widest font-sans font-medium text-foreground/70 hover:text-foreground transition-colors"
                  aria-label="Iniciar sesión"
                >
                  Entrar
                </button>
              </SignInButton>
            )}

            <button
              onClick={() => setIsOpen(true)}
              className="text-foreground/70 hover:text-foreground transition-colors relative"
              aria-label="Carrito"
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-accent text-accent-foreground text-[10px] flex items-center justify-center rounded-full">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search bar (expandable) */}
        {searchOpen && (
          <div className="pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <input
              type="text"
              placeholder="Buscar prendas..."
              className="w-full border-b border-foreground/20 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground font-sans"
              autoFocus
            />
          </div>
        )}
      </div>
    </header>
  );
}
