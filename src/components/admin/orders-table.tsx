"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateOrderStatus, shipOrder } from "@/lib/actions/orders";
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
            <TableHead className="px-4">Tracking</TableHead>
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
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  const total = order.order_items.reduce((sum, item) => sum + item.price, 0);
  const config = STATUS_CONFIG[order.status];

  function handleStatusChange(newStatus: string) {
    if (newStatus === "shipped") {
      setShippingOrderId(order.id);
      setTrackingInput("");
      return;
    }

    startTransition(async () => {
      const result = await updateOrderStatus(order.id, newStatus as OrderStatus);

      if ("error" in result) {
        toast.error("Error al actualizar", { description: result.error });
      } else {
        toast.success("Estado actualizado");
      }
    });
  }

  function handleConfirmShip() {
    if (!trackingInput.trim()) {
      toast.error("Ingresá un número de tracking");
      return;
    }

    startTransition(async () => {
      const result = await shipOrder(order.id, trackingInput.trim());

      if ("error" in result) {
        toast.error("Error al enviar", { description: result.error });
      } else {
        toast.success("Pedido marcado como enviado");
        setShippingOrderId(null);
        setTrackingInput("");
      }
    });
  }

  return (
    <>
      <TableRow className={isPending ? "opacity-50" : ""}>
        <TableCell className="px-4 font-mono text-sm">#{order.id.slice(0, 8)}</TableCell>
        <TableCell className="px-4">
          <div>
            <p className="font-medium">{order.customer_name}</p>
            <p className="text-xs text-muted-foreground">{order.customer_email}</p>
          </div>
        </TableCell>
        <TableCell className="px-4">{formatPrice(total)}</TableCell>
        <TableCell className="px-4">
          <Badge variant={config.variant ?? "outline"} className={config.className}>
            {config.label}
          </Badge>
        </TableCell>
        <TableCell className="px-4 font-mono text-sm text-muted-foreground">
          {order.tracking_number || "-"}
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

      <Dialog
        open={shippingOrderId === order.id}
        onOpenChange={(open) => {
          if (!open) {
            setShippingOrderId(null);
            setTrackingInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription>
              Orden #{order.id.slice(0, 8)} — {order.customer_name}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <label htmlFor="tracking" className="text-sm font-medium">
              Número de tracking
            </label>
            <Input
              id="tracking"
              placeholder="Ej: RR123456789AR"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmShip();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Se enviará un email al cliente con el número de seguimiento.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShippingOrderId(null);
                setTrackingInput("");
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmShip} disabled={isPending}>
              {isPending ? "Enviando..." : "Confirmar envío"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
