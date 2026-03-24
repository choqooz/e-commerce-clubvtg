"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateOrderStatus } from "@/lib/actions/orders";
import { formatPrice } from "@/lib/config";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

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

interface OrdersTableProps {
  orders: (Order & { order_items: OrderItem[] })[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="bg-background border rounded-lg shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="px-4">Orden</TableHead>
            <TableHead className="px-4">Cliente</TableHead>
            <TableHead className="px-4">Total</TableHead>
            <TableHead className="px-4">Estado</TableHead>
            <TableHead className="px-4">Fecha</TableHead>
            <TableHead className="px-4">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrderRow({ order }: { order: Order & { order_items: OrderItem[] } }) {
  const [isPending, startTransition] = useTransition();

  const total = order.order_items.reduce((sum, item) => sum + item.price, 0);
  const config = STATUS_CONFIG[order.status];

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, newStatus as OrderStatus);

      if ("error" in result) {
        toast.error("Error al actualizar", { description: result.error });
      } else {
        toast.success("Estado actualizado");
      }
    });
  }

  return (
    <TableRow className={isPending ? "opacity-50" : ""}>
      <TableCell className="px-4 font-mono text-sm">
        #{order.id.slice(0, 8)}
      </TableCell>
      <TableCell className="px-4">
        <div>
          <p className="font-medium">{order.customer_name}</p>
          <p className="text-xs text-muted-foreground">{order.customer_email}</p>
        </div>
      </TableCell>
      <TableCell className="px-4">{formatPrice(total)}</TableCell>
      <TableCell className="px-4">
        <Badge
          variant={config.variant ?? "outline"}
          className={config.className}
        >
          {config.label}
        </Badge>
      </TableCell>
      <TableCell className="px-4 text-muted-foreground">
        {new Date(order.created_at).toLocaleDateString("es-AR")}
      </TableCell>
      <TableCell className="px-4">
        <Select
          defaultValue={order.status}
          onValueChange={handleStatusChange}
          disabled={isPending}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
            <SelectItem value="shipped">Enviado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}
