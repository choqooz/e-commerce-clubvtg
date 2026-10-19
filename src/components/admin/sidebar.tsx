"use client";

import { LayoutDashboard, Menu, Package, ShoppingCart, Ticket, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Productos",
    href: "/admin/products",
    icon: Package,
  },
  {
    title: "Órdenes",
    href: "/admin/orders",
    icon: ShoppingCart,
  },
  {
    title: "Cupones",
    href: "/admin/coupons",
    icon: Ticket,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-midnight-ink bg-bone-white font-sans font-normal text-midnight-ink md:flex">
      <div className="flex min-h-[72px] items-center gap-[8px] border-b border-midnight-ink px-[24px] py-[18px]">
        <Link
          href="/"
          aria-label="clubvtg — Inicio"
          className="focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
        >
          <BrandMark alt="" className="w-[120px]" />
        </Link>
        <span className="font-mono text-[13px] font-normal">Admin</span>
      </div>

      <nav
        aria-label="Navegación de administración"
        className="flex-1 space-y-[6px] px-[18px] py-[24px]"
      >
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[36px] items-center gap-[13px] rounded-none border px-[6px] py-[2px] font-mono text-[13px] font-normal text-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink",
                isActive
                  ? "border-midnight-ink bg-warm-sand"
                  : "border-transparent hover:underline underline-offset-4",
              )}
            >
              <item.icon size={18} />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/"
        className="mx-[18px] mb-[24px] flex min-h-[44px] items-center border-t border-midnight-ink font-mono text-[13px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
      >
        Volver a la tienda
      </Link>
    </aside>
  );
}

export function AdminMobileNavigation() {
  const pathname = usePathname();
  const [menu, setMenu] = useState({ pathname, open: false, navigating: false });
  // Layouts persist across routes; reset before rendering a stale open dialog.
  if (menu.pathname !== pathname) {
    setMenu({ pathname, open: false, navigating: true });
  }
  const close = () => {
    setMenu({ pathname, open: false, navigating: true });
  };
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 48rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenu((current) => ({ ...current, open: false }));
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-[18px] border-b border-midnight-ink bg-bone-white px-[18px] md:hidden">
      <div className="flex items-center gap-[8px]">
        <BrandMark className="w-[120px]" />
        <span className="font-mono text-[13px] font-normal">Admin</span>
      </div>
      <Sheet
        open={menu.open && menu.pathname === pathname}
        onOpenChange={(open) => {
          setMenu({ pathname, open, navigating: false });
        }}
      >
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú de administración"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-[min(360px,100vw)] max-w-full overflow-y-auto p-[24px] sm:max-w-[360px]"
          onCloseAutoFocus={(event) => {
            if (window.matchMedia("(min-width: 48rem)").matches) {
              event.preventDefault();
              const nav = document.querySelector('nav[aria-label="Navegación de administración"]');
              (
                nav?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ??
                nav?.querySelector<HTMLAnchorElement>("a")
              )?.focus();
            } else if (menu.navigating) event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between gap-[18px] border-b border-midnight-ink pb-[18px]">
            <SheetTitle>Administración</SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Cerrar menú de administración"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </SheetClose>
          </div>
          <nav aria-label="Navegación móvil de administración" className="space-y-[6px]">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[44px] items-center gap-[13px] border px-[6px] font-mono text-[13px] font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink",
                    active
                      ? "border-midnight-ink bg-warm-sand"
                      : "border-transparent hover:underline underline-offset-4",
                  )}
                >
                  <item.icon size={18} aria-hidden="true" />
                  {item.title}
                </Link>
              );
            })}
            <Link
              href="/"
              onClick={close}
              className="flex min-h-[44px] items-center border-t border-midnight-ink font-mono text-[13px] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
            >
              Volver a la tienda
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
