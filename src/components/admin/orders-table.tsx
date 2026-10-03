"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  OrderPricingHistory,
  formatHistoricalOrderTotal,
} from "@/components/orders/order-pricing-history";
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
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import type { OrderStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string; variant?: "destructive" }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-warm-sand text-midnight-ink",
  },
  paid: {
    label: "Pagado",
    className: "bg-bone-white text-midnight-ink",
  },
  shipped: {
    label: "Enviado",
    className: "bg-midnight-ink text-bone-white",
  },
  cancelled: {
    label: "Cancelado",
    className: "",
    variant: "destructive",
  },
};

interface OrdersTableProps {
  orders: OrderHistoryOrder[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-none border border-midnight-ink bg-bone-white">
      <Table className="min-w-[920px]">
        <TableHeader>
          <TableRow className="bg-warm-sand">
            <TableHead>Orden</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Tracking</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acción</TableHead>
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

function OrderRow({ order }: { order: OrderHistoryOrder }) {
  const [isPending, startTransition] = useTransition();
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

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
        <TableCell className="font-mono text-[13px]">#{order.id.slice(0, 8)}</TableCell>
        <TableCell>
          <div className="grid max-w-[240px] gap-[6px] whitespace-normal break-words">
            <p className="font-normal">{order.customer_name}</p>
            <p className="font-mono text-[13px] text-midnight-ink break-all">
              {order.customer_email}
            </p>
          </div>
        </TableCell>
        <TableCell className="font-mono text-[13px]">{formatHistoricalOrderTotal(order)}</TableCell>
        <TableCell>
          <Badge variant={config.variant ?? "outline"} className={config.className}>
            {config.label}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[180px] font-mono text-[13px] text-midnight-ink whitespace-normal break-all">
          {order.tracking_number || "-"}
        </TableCell>
        <TableCell className="font-mono text-[13px] text-midnight-ink">
          {new Date(order.created_at).toLocaleDateString("es-AR")}
        </TableCell>
        <TableCell>
          <Select
            defaultValue={order.status}
            onValueChange={handleStatusChange}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="h-[36px] min-w-[130px]">
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

      <TableRow>
        <TableCell colSpan={7} className="whitespace-normal p-[13px]">
          <OrderPricingHistory order={order} />
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
          <DialogHeader className="pr-[36px]">
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription className="break-words text-midnight-ink">
              Orden #{order.id.slice(0, 8)} — {order.customer_name}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-w-0 gap-[13px] py-[6px]">
            <label htmlFor="tracking" className="font-mono text-[13px] font-normal">
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
            <p className="text-[15px] leading-[1.3] text-midnight-ink">
              Se enviará un email al cliente con el número de seguimiento.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setShippingOrderId(null);
                setTrackingInput("");
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleConfirmShip} disabled={isPending}>
              {isPending ? "Enviando..." : "Confirmar envío"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
