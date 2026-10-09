"use client";

import { useAuth, useClerk, SignInButton, UserButton } from "@clerk/nextjs";
import { Search, ShoppingBag, Sparkles, User, Package, CreditCard, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { useCart } from "@/contexts/cart-context";
import { getUserCredits } from "@/lib/actions/credits";
import announcement from "./storefront-announcement.module.css";

const SHIPPING_NOTICE = "Envío a todo el país · Correo Argentino";

export function ShippingAnnouncement() {
  const pauseInstructionId = useId();

  return (
    <div
      className={`${announcement.bar} flex h-[20px] items-center bg-warm-sand text-center text-[10px] leading-[12px] whitespace-nowrap uppercase md:h-[26px] md:text-[12px] md:leading-[16px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-midnight-ink`}
      role="group"
      aria-label="Aviso de envíos"
      aria-describedby={pauseInstructionId}
      tabIndex={0}
    >
      <span className={announcement.notice}>{SHIPPING_NOTICE}</span>
      {/* Focus pauses the CSS loop until blur; no manual state or hidden button. */}
      <span id={pauseInstructionId} className="sr-only">
        El texto se pausa mientras este aviso tiene el foco. Usá Tab para continuar.
      </span>
      <div className={announcement.viewport} aria-hidden="true">
        <div className={announcement.track}>
          {/* Equal groups include seam spacing; translating half the track loops exactly. */}
          {[0, 1].map((group) => (
            <div key={group} className={announcement.group}>
              {Array.from({ length: 6 }, (_, copy) => (
                <span key={copy}>{SHIPPING_NOTICE}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreditBadge({ credits }: { credits: number | null }) {
  if (credits === null) return null;

  return (
    <Link
      href="/credits"
      aria-label={`Créditos IA: ${credits}`}
      className="flex h-[44px] min-w-[32px] max-w-[64px] items-center justify-center gap-[2px] font-mono text-[11px] font-normal text-midnight-ink md:gap-[6px] md:text-[13px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
    >
      <Sparkles size={14} strokeWidth={1.5} />
      <span className="truncate">{credits}</span>
    </Link>
  );
}

type MenuAction = "catalog" | "search" | "signIn" | "account" | "signOut";
const DESKTOP_QUERY = "(min-width: 48rem)";
const MENU_ITEM =
  "flex min-h-[44px] w-full items-center justify-between gap-[12px] py-[12px] text-left text-[18px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink";

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [balance, setBalance] = useState<{ userId: string; credits: number } | null>(null);
  const [actionReady, setActionReady] = useState(0);
  const pendingAction = useRef<MenuAction | null>(null);
  const menuOpenRef = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const homeLink = useRef<HTMLAnchorElement>(null);
  const { totalItems, setIsOpen } = useCart();
  const { isSignedIn, userId } = useAuth();
  const { openSignIn, openUserProfile, signOut } = useClerk();
  const credits = isSignedIn && balance?.userId === userId ? balance.credits : null;

  // One session-scoped request supplies both presentations; stale results stay invisible.
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let active = true;
    getUserCredits()
      .then((result) => {
        if (active && result) setBalance({ userId, credits: result.credits });
      })
      .catch(() => {
        // An unavailable balance must not become a fabricated zero.
      });
    return () => {
      active = false;
    };
  }, [isSignedIn, userId]);

  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      pendingAction.current = null;
      menuOpenRef.current = false;
      setMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      pendingAction.current = null;
    };
  }, []);

  // Radix finishes releasing the focus scope before a second managed dialog opens.
  useEffect(() => {
    if (!actionReady || menuOpen) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    if (!action || action === "catalog" || window.matchMedia(DESKTOP_QUERY).matches) return;
    if (action === "search") {
      searchInput.current?.focus(); // Already-visible inputs do not autofocus again.
      return;
    }
    if ((action === "signIn" && isSignedIn) || (action !== "signIn" && !isSignedIn)) return;
    try {
      if (action === "signIn") openSignIn();
      else if (action === "account") openUserProfile();
      else {
        void signOut({ redirectUrl: "/" }).catch(() =>
          toast.error("No pudimos cerrar la sesión. Intentá de nuevo."),
        );
      }
    } catch {
      toast.error("No pudimos abrir la cuenta. Intentá de nuevo.");
    }
  }, [actionReady, menuOpen, isSignedIn, openSignIn, openUserProfile, signOut]);

  const changeMenuOpen = (open: boolean) => {
    pendingAction.current = null;
    menuOpenRef.current = open;
    setActionReady(0);
    setMenuOpen(open);
  };
  const queueAction = (action: MenuAction) => {
    pendingAction.current = action;
    menuOpenRef.current = false;
    setActionReady(0); // A previous close must not authorize this action before its own close.
    setMenuOpen(false);
  };
  const navigateCatalog = () => {
    if (menuOpenRef.current) queueAction("catalog");
    else changeMenuOpen(false);
    // Native anchors emit no hashchange when the fragment is already selected.
    if (window.location.pathname === "/" && window.location.hash === "#catalog")
      window.dispatchEvent(new Event("hashchange"));
  };

  return (
    <header className="sticky top-0 z-50 bg-white font-sans font-normal text-midnight-ink">
      <ShippingAnnouncement />

      <div>
        {/* In-flow sticky chrome keeps the first interactive tile below both bars. */}
        <div className="relative grid h-[50px] grid-cols-[1fr_auto_1fr] items-center gap-[4px] px-[10px] md:h-[80px] md:grid-cols-[3fr_2fr_3fr] md:gap-[8px] md:px-[6.25%]">
          <Sheet open={menuOpen} onOpenChange={changeMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Abrir menú"
                className="flex h-[44px] w-[44px] items-center justify-center justify-self-start md:hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              aria-describedby={undefined}
              className="w-[min(360px,100vw)] max-w-full overflow-y-auto bg-white p-[24px] sm:max-w-[360px]"
              onCloseAutoFocus={(event) => {
                if (menuOpenRef.current) return;
                if (window.matchMedia(DESKTOP_QUERY).matches) {
                  event.preventDefault();
                  homeLink.current?.focus();
                  return;
                }
                // Purposeful navigation owns destination focus; dismissal still restores the trigger.
                if (pendingAction.current === "catalog" || pendingAction.current === "search")
                  event.preventDefault();
                if (pendingAction.current === "search") setSearchOpen(true);
                if (pendingAction.current) setActionReady((version) => version + 1);
              }}
            >
              <div className="flex shrink-0 items-center justify-between gap-[12px]">
                <SheetTitle>Menú</SheetTitle>
                <SheetClose asChild>
                  <button
                    type="button"
                    aria-label="Cerrar menú"
                    className="flex h-[44px] w-[44px] items-center justify-center focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                  >
                    <X size={20} strokeWidth={1.5} />
                  </button>
                </SheetClose>
              </div>
              <nav aria-label="Navegación móvil" className="flex min-w-0 flex-col">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Preserve native collection hash navigation. */}
                <a href="/#catalog" className={MENU_ITEM} onClick={navigateCatalog}>
                  Catálogo
                </a>
                <button type="button" className={MENU_ITEM} onClick={() => queueAction("search")}>
                  Buscar
                </button>
                <Link href="/credits" className={MENU_ITEM} onClick={() => changeMenuOpen(false)}>
                  Créditos IA
                  {credits !== null && (
                    <span className="font-mono text-[13px]" aria-label={`Saldo: ${credits}`}>
                      {credits}
                    </span>
                  )}
                </Link>
                {isSignedIn ? (
                  <>
                    <Link
                      href="/profile"
                      className={MENU_ITEM}
                      onClick={() => changeMenuOpen(false)}
                    >
                      Mi Perfil
                    </Link>
                    <Link
                      href="/orders"
                      className={MENU_ITEM}
                      onClick={() => changeMenuOpen(false)}
                    >
                      Mis Pedidos
                    </Link>
                    <button
                      type="button"
                      className={MENU_ITEM}
                      onClick={() => queueAction("account")}
                    >
                      Administrar cuenta
                    </button>
                    <button
                      type="button"
                      className={MENU_ITEM}
                      onClick={() => queueAction("signOut")}
                    >
                      Cerrar sesión
                    </button>
                  </>
                ) : (
                  <button type="button" className={MENU_ITEM} onClick={() => queueAction("signIn")}>
                    Entrar
                  </button>
                )}
                <a
                  href="mailto:choqooz@gmail.com"
                  className={MENU_ITEM}
                  onClick={() => changeMenuOpen(false)}
                >
                  Contacto
                </a>
              </nav>
            </SheetContent>
          </Sheet>
          <nav
            aria-label="Tienda"
            className="hidden shrink-0 items-center md:flex md:justify-between md:pr-[24px]"
          >
            {/* Native fragment navigation notifies the collection's hash subscription. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Same-document hash changes must emit hashchange, including on the current home route. */}
            <a
              href="/#catalog"
              aria-label="Catálogo"
              onClick={navigateCatalog}
              className="flex h-[44px] min-w-[40px] items-center text-[11px] leading-[18px] uppercase md:text-[15px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              <span className="hidden md:inline">Catálogo</span>
            </a>
            <Link
              href="/credits"
              className="hidden h-[44px] items-center text-[15px] leading-[18px] uppercase md:flex hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              Créditos IA
            </Link>
          </nav>

          {/* Brand is not a route heading. Native home navigation clears collection state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A home visit must leave the hash-only collection even when the pathname is already /. */}
          <a
            href="/"
            aria-label="clubvtg — Inicio"
            ref={homeLink}
            className="flex h-[44px] shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
          >
            <span className="font-sans text-[20px] leading-none font-normal tracking-[-0.04em] md:text-[30px]">
              clubvtg
            </span>
          </a>

          <div className="flex min-w-0 items-center justify-end md:justify-between md:pl-[24px]">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="hidden h-[44px] w-[32px] shrink-0 items-center justify-center text-midnight-ink md:flex md:w-[44px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              aria-label="Buscar"
              aria-expanded={searchOpen}
              aria-controls="storefront-search"
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            {/* Clerk Auth: the managed control and appearance remain unchanged. */}
            {isSignedIn ? (
              <>
                <div className="hidden md:block">
                  <CreditBadge credits={credits} />
                </div>
                <div className="hidden h-[44px] min-w-[32px] shrink-0 items-center justify-center md:flex">
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
                  className="hidden h-[44px] min-w-[36px] shrink-0 items-center justify-center whitespace-nowrap text-[11px] leading-[18px] font-normal uppercase text-midnight-ink md:flex md:text-[15px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
                  aria-label="Iniciar sesión"
                >
                  Entrar
                </button>
              </SignInButton>
            )}

            <button
              onClick={() => setIsOpen(true)}
              className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              aria-label="Carrito"
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              {totalItems > 0 && (
                <span className="absolute top-[1px] right-0 flex min-h-[16px] min-w-[16px] items-center justify-center bg-white px-[2px] font-mono text-[11px] leading-[16px] font-normal">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search bar (expandable, no search behavior is introduced). */}
        {searchOpen && (
          <div id="storefront-search" className="px-[14px] pb-[18px] md:px-[6.25%]">
            <input
              ref={searchInput}
              aria-label="Buscar prendas"
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
