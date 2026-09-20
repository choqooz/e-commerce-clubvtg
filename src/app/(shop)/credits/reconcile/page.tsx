import { redirect } from "next/navigation";
import { CreditPaymentReconciliationHandoff } from "@/components/credit-payment-reconciliation-handoff";
import { isCreditIntentId } from "@/lib/payments/return-authority";

interface CreditReconcilePageProps {
  searchParams: Promise<{ intent_id?: string | string[] }>;
}

export default async function CreditReconcilePage({ searchParams }: CreditReconcilePageProps) {
  const { intent_id: intentId } = await searchParams;
  if (typeof intentId !== "string" || !isCreditIntentId(intentId)) redirect("/credits");

  return <CreditPaymentReconciliationHandoff intentId={intentId} />;
}
