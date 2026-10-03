"use client";

import { LayoutDashboard, Package, ShoppingCart, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <div className="flex min-h-[72px] items-center border-b border-midnight-ink px-[24px] py-[18px]">
        <Link
          href="/"
          className="focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink"
        >
          <h1 className="font-sans text-[20px] leading-[1.3] font-normal">
            clubvtg <span className="ml-[6px] font-mono text-[13px] font-normal">Admin</span>
          </h1>
        </Link>
      </div>

      <nav className="flex-1 space-y-[6px] px-[18px] py-[24px]">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
