import { OrdersTable } from "@/components/admin/orders-table";
import { getAdminOrders } from "@/lib/actions/orders";

export const metadata = {
  title: "Órdenes | Admin ClubVTG",
};

export default async function AdminOrdersPage() {
  const typedOrders = (await getAdminOrders()) ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-[24px]">
      <div>
        <h1 className="font-sans text-[30px] font-normal leading-none">Órdenes</h1>
        <p className="mt-[6px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
          Gestión de pedidos ({typedOrders.length} en total).
        </p>
      </div>

      {typedOrders.length === 0 ? (
        <div className="rounded-none border border-midnight-ink bg-warm-sand p-[24px] text-center font-sans text-[15px] font-normal text-midnight-ink">
          No hay órdenes aún
        </div>
      ) : (
        <OrdersTable orders={typedOrders} />
      )}
    </div>
  );
}
