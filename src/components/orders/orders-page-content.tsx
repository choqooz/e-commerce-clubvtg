"use client";

import { ExternalLink, Package, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/config";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

// ── Types for the joined query ──

interface OrderItemWithProduct extends OrderItem {
  products: {
    title: string;
    image_urls: string[];
    slug: string;
  } | null;
}

interface OrderWithItems extends Order {
  order_items: OrderItemWithProduct[];
}

// ── Status config (mirrors admin) ──

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string; variant?: "destructive" }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  paid: {
    label: "Pagado",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  shipped: {
    label: "Enviado",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  cancelled: {
    label: "Cancelado",
    className: "",
    variant: "destructive",
  },
};

// ── Component ──

interface OrdersPageContentProps {
  orders: OrderWithItems[];
}

export function OrdersPageContent({ orders }: OrdersPageContentProps) {
  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-heading font-light tracking-wide">Mis Pedidos</h1>

        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

// ── Order Card ──

function OrderCard({ order }: { order: OrderWithItems }) {
  const total = order.order_items.reduce((sum, item) => sum + item.price, 0);
  const config = STATUS_CONFIG[order.status];
  const formattedDate = new Date(order.created_at).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="rounded-lg border bg-background shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-medium">#{order.id.slice(0, 8)}</span>
          <Badge variant={config.variant ?? "outline"} className={config.className}>
            {config.label}
          </Badge>
        </div>
        <time className="text-sm text-muted-foreground">{formattedDate}</time>
      </div>

      <Separator />

      {/* Tracking info */}
      {order.status === "shipped" && order.tracking_number && (
        <>
          <div className="flex items-center gap-2 px-5 py-3 bg-blue-50 dark:bg-blue-950/20">
            <Truck className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm">
              Número de seguimiento:{" "}
              <span className="font-mono font-medium">{order.tracking_number}</span>
            </span>
            <a
              href={`https://www.correoargentino.com.ar/formularios/e-comercio?id=${order.tracking_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Rastrear
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <Separator />
        </>
      )}

      {/* Items */}
      <div className="px-5 py-4 space-y-3">
        {order.order_items.map((item) => (
          <OrderItemRow key={item.id} item={item} />
        ))}
      </div>

      <Separator />

      {/* Footer — Total */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm text-muted-foreground">
          {order.order_items.length} {order.order_items.length === 1 ? "producto" : "productos"}
        </span>
        <span className="text-base font-semibold">{formatPrice(total)}</span>
      </div>
    </article>
  );
}

// ── Order Item Row ──

function OrderItemRow({ item }: { item: OrderItemWithProduct }) {
  const product = item.products;
  const imageUrl = product?.image_urls?.[0];

  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <Link href={product?.slug ? `/product/${product.slug}` : "#"} className="shrink-0">
          <Image
            src={imageUrl}
            alt={product?.title ?? "Producto"}
            width={60}
            height={60}
            className="rounded-md object-cover size-[60px]"
          />
        </Link>
      ) : (
        <div className="shrink-0 size-[60px] rounded-md bg-muted flex items-center justify-center">
          <Package className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {product?.slug ? (
          <Link
            href={`/product/${product.slug}`}
            className="text-sm font-medium hover:underline line-clamp-1"
          >
            {product.title}
          </Link>
        ) : (
          <span className="text-sm font-medium line-clamp-1">Producto</span>
        )}
        <p className="text-sm text-muted-foreground">{formatPrice(item.price)}</p>
      </div>
    </div>
  );
}
