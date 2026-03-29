import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { getUserOrders } from "@/lib/actions/orders";
import { OrdersPageContent } from "@/components/orders/orders-page-content";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Mis Pedidos | ClubVTG",
  description: "Revisá el estado de tus pedidos en ClubVTG.",
};

export default async function OrdersPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/orders");
  }

  const orders = await getUserOrders();

  if (!orders || orders.length === 0) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="mx-auto max-w-md space-y-6">
          <div className="text-6xl">📦</div>
          <h1 className="text-3xl font-heading font-light tracking-wide">
            No tenés pedidos aún
          </h1>
          <p className="text-muted-foreground">
            Cuando hagas tu primera compra, vas a poder ver el estado de tus
            pedidos acá.
          </p>
          <Button asChild>
            <Link href="/">Explorar catálogo</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <OrdersPageContent orders={orders} />;
}
