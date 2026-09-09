import { redirect } from "next/navigation";
import { PaymentReconciliationHandoff } from "@/components/payment-reconciliation-handoff";
import { isOrderId } from "@/lib/payments/return-authority";

interface CheckoutReconcilePageProps {
  searchParams: Promise<{ order_id?: string | string[] }>;
}

export default async function CheckoutReconcilePage({ searchParams }: CheckoutReconcilePageProps) {
  const { order_id: orderId } = await searchParams;
  if (typeof orderId !== "string" || !isOrderId(orderId)) redirect("/checkout/pending");

  return <PaymentReconciliationHandoff orderId={orderId} />;
}
