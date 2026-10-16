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
    <div className="w-full bg-bone-white px-[18px] pt-0 pb-[42px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink md:px-[30px]">
      <div className="mx-auto min-w-0 max-w-[1200px] space-y-[30px] lg:space-y-[42px]">
        <h1 className="border-b border-midnight-ink pb-[30px] font-sans text-[48px] font-normal leading-[1.1] sm:text-[60px] lg:pb-[42px] lg:text-[72px]">
          Mis Pedidos
        </h1>

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
      <header className="flex flex-col gap-[18px] px-[18px] py-[24px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:px-[30px]">
        <div className="flex min-w-0 flex-wrap items-center gap-[18px]">
          <h2 className="font-mono text-[20px] font-normal leading-[1.3]">
            #{order.id.slice(0, 8)}
          </h2>
          <Badge variant={config.variant ?? "outline"} className={config.className}>
            {config.label}
          </Badge>
        </div>
        <time className="font-mono text-[13px] leading-[1.5] text-midnight-ink">
          {formattedDate}
        </time>
      </header>

      <Separator />

      {/* Tracking info */}
      {order.status === "shipped" && order.tracking_number && (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[18px] bg-warm-sand px-[18px] py-[18px] lg:px-[30px]">
            <Truck className="size-[16px] text-midnight-ink shrink-0" />
            <span className="min-w-0 flex-1 basis-[200px] break-words text-[15px] leading-[1.5]">
              Número de seguimiento:{" "}
              <span className="font-mono text-[13px] font-normal break-all">
                {order.tracking_number}
              </span>
            </span>
            <a
              href={`https://www.correoargentino.com.ar/formularios/e-comercio?id=${order.tracking_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-[12px] border border-midnight-ink px-[18px] py-[12px] font-mono text-[13px] text-midnight-ink hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 sm:ml-auto sm:w-auto"
            >
              Rastrear
              <ExternalLink className="size-[14px]" />
            </a>
          </div>
          <Separator />
        </>
      )}

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
        {/* Items */}
        <div className="min-w-0 space-y-[24px] px-[18px] py-[24px] lg:px-[30px] lg:py-[30px]">
          {order.order_items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </div>

        <Separator className="lg:hidden" />

        <div className="min-w-0 px-[18px] py-[24px] lg:border-l lg:border-midnight-ink lg:px-[30px] lg:py-[30px]">
          <OrderPricingHistory order={order} />
        </div>
      </div>

      <Separator />

      {/* Footer — Total */}
      <footer className="flex flex-wrap items-baseline justify-between gap-[18px] bg-warm-sand px-[18px] py-[24px] lg:px-[30px]">
        <span className="text-[13px] font-mono text-midnight-ink">
          {order.order_items.length} {order.order_items.length === 1 ? "producto" : "productos"}
        </span>
        <span className="break-all text-[30px] font-normal leading-[1.2] sm:text-[36px]">
          {formatHistoricalOrderTotal(order)}
        </span>
      </footer>
    </article>
  );
}

// ── Order Item Row ──

function OrderItemRow({ item }: { item: OrderHistoryOrder["order_items"][number] }) {
  const product = item.products;
  const imageUrl = product?.image_urls?.[0];

  return (
    <div className="flex min-w-0 items-start gap-[18px]">
      {imageUrl ? (
        <Link
          href={product?.slug ? `/product/${product.slug}` : "#"}
          className="shrink-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
        >
          <Image
            src={imageUrl}
            alt={product?.title ?? "Producto"}
            width={60}
            height={60}
            className="h-[100px] w-[80px] bg-warm-sand object-cover"
          />
        </Link>
      ) : (
        <div className="flex h-[100px] w-[80px] shrink-0 items-center justify-center bg-warm-sand">
          <Package className="size-[20px] text-midnight-ink" />
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-[12px]">
        {product?.slug ? (
          <Link
            href={`/product/${product.slug}`}
            className="inline-flex min-h-[48px] items-center break-words text-[16px] font-normal leading-[1.5] hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          >
            {product.title}
          </Link>
        ) : (
          <span className="inline-flex min-h-[48px] items-center text-[16px] font-normal leading-[1.5]">
            Producto
          </span>
        )}
        <p className="break-all font-mono text-[13px] leading-[1.5] text-midnight-ink">
          {formatHistoricalOrderTotal({ total_amount: item.price, total_cents: item.final_cents })}
        </p>
      </div>
    </div>
  );
}
