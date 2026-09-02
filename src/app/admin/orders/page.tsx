import { OrdersTable } from "@/components/admin/orders-table";
import { getAdminOrders } from "@/lib/actions/orders";

export const metadata = {
  title: "Órdenes | Admin ClubVTG",
};

export default async function AdminOrdersPage() {
  const typedOrders = (await getAdminOrders()) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-medium tracking-wide">Órdenes</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gestión de pedidos ({typedOrders.length} en total).
        </p>
      </div>

      {typedOrders.length === 0 ? (
        <div className="bg-background border rounded-lg shadow-sm p-8 text-center text-muted-foreground">
          No hay órdenes aún
        </div>
      ) : (
        <OrdersTable orders={typedOrders} />
      )}
    </div>
  );
}
