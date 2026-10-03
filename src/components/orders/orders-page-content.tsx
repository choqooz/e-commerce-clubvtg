"use client";

import { ExternalLink, Package, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import type { OrderStatus } from "@/lib/types";
import { OrderPricingHistory, formatHistoricalOrderTotal } from "./order-pricing-history";

// ── Types for the joined query ──

// ── Status config (mirrors admin) ──

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string; variant?: "destructive" }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-warm-sand text-midnight-ink border-midnight-ink",
  },
  paid: {
    label: "Pagado",
    className: "bg-bone-white text-midnight-ink border-midnight-ink",
  },
  shipped: {
    label: "Enviado",
    className: "bg-warm-sand text-midnight-ink border-midnight-ink",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-bone-white text-midnight-ink border-midnight-ink border-dotted",
    variant: "destructive",
  },
};

// ── Component ──

interface OrdersPageContentProps {
  orders: OrderHistoryOrder[];
}

export function OrdersPageContent({ orders }: OrdersPageContentProps) {
  return (
    <div className="w-full px-[18px] py-[42px] md:px-[30px] bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]">
      <div className="mx-auto min-w-0 max-w-[768px] space-y-[24px]">
        <h1 className="text-[30px] leading-[1.2] font-sans font-normal">Mis Pedidos</h1>

        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

// ── Order Card ──

function OrderCard({ order }: { order: OrderHistoryOrder }) {
  const config = STATUS_CONFIG[order.status];
  const formattedDate = new Date(order.created_at).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="min-w-0 border border-midnight-ink bg-bone-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-[6px] px-[13px] py-[18px]">
        <div className="flex flex-wrap items-center gap-[13px]">
          <span className="font-mono text-[13px] font-normal">#{order.id.slice(0, 8)}</span>
          <Badge variant={config.variant ?? "outline"} className={config.className}>
            {config.label}
          </Badge>
        </div>
        <time className="text-[13px] font-mono text-midnight-ink">{formattedDate}</time>
      </div>

      <Separator />

      {/* Tracking info */}
      {order.status === "shipped" && order.tracking_number && (
        <>
          <div className="flex flex-wrap items-center gap-[6px] px-[13px] py-[13px] bg-warm-sand">
            <Truck className="size-[16px] text-midnight-ink shrink-0" />
            <span className="min-w-0 text-[15px] break-words">
              Número de seguimiento:{" "}
              <span className="font-mono text-[13px] font-normal break-all">{order.tracking_number}</span>
            </span>
            <a
              href={`https://www.correoargentino.com.ar/formularios/e-comercio?id=${order.tracking_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex min-h-[36px] items-center gap-[6px] text-[13px] font-mono text-midnight-ink hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
            >
              Rastrear
              <ExternalLink className="size-[14px]" />
            </a>
          </div>
          <Separator />
        </>
      )}

      {/* Items */}
      <div className="px-[13px] py-[18px] space-y-[13px]">
        {order.order_items.map((item) => (
          <OrderItemRow key={item.id} item={item} />
        ))}
      </div>

      <Separator />

      <div className="px-[13px] py-[18px]">
        <OrderPricingHistory order={order} />
      </div>

      <Separator />

      {/* Footer — Total */}
      <div className="flex flex-wrap items-center justify-between gap-[13px] px-[13px] py-[13px]">
        <span className="text-[13px] font-mono text-midnight-ink">
          {order.order_items.length} {order.order_items.length === 1 ? "producto" : "productos"}
        </span>
        <span className="text-[20px] font-normal">{formatHistoricalOrderTotal(order)}</span>
      </div>
    </article>
  );
}

// ── Order Item Row ──

function OrderItemRow({ item }: { item: OrderHistoryOrder["order_items"][number] }) {
  const product = item.products;
  const imageUrl = product?.image_urls?.[0];

  return (
    <div className="flex items-center gap-[13px]">
      {imageUrl ? (
        <Link href={product?.slug ? `/product/${product.slug}` : "#"} className="shrink-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2">
          <Image
            src={imageUrl}
            alt={product?.title ?? "Producto"}
            width={60}
            height={60}
            className="object-cover size-[60px]"
          />
        </Link>
      ) : (
        <div className="shrink-0 size-[60px] bg-warm-sand flex items-center justify-center">
          <Package className="size-[20px] text-midnight-ink" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {product?.slug ? (
          <Link
            href={`/product/${product.slug}`}
            className="text-[15px] font-normal hover:underline line-clamp-1 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          >
            {product.title}
          </Link>
        ) : (
          <span className="text-[15px] font-normal line-clamp-1">Producto</span>
        )}
        <p className="text-[15px] text-midnight-ink">{formatHistoricalOrderTotal({ total_amount: item.price, total_cents: item.final_cents })}</p>
      </div>
    </div>
  );
}
