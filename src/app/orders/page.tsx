import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrdersPageContent } from "@/components/orders/orders-page-content";
import { Button } from "@/components/ui/button";
import { getUserOrders } from "@/lib/actions/orders";

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
      <div className="w-full bg-bone-white px-[18px] py-[42px] text-center font-sans font-normal text-[15px] leading-[1.3] text-midnight-ink">
        <div className="mx-auto min-w-0 max-w-[448px] space-y-[24px]">
          <div className="text-[60px] leading-[1]">📦</div>
          <h1 className="font-sans font-normal text-[30px] leading-[1.2]">No tenés pedidos aún</h1>
          <p className="text-midnight-ink">
            Cuando hagas tu primera compra, vas a poder ver el estado de tus pedidos acá.
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
