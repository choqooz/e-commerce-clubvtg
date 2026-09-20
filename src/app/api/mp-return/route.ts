import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  PRODUCT_RETURN_OUTCOME,
  getOwnedCreditReturnIntent,
  getOwnedProductReturnOrder,
  getProductReturnOutcome,
} from "@/lib/payments/return-authority";
import { getPublicAppOrigin } from "@/lib/urls";

export async function GET(req: Request) {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return NextResponse.redirect(`${getPublicAppOrigin()}/checkout/pending`);
  }
  const orderId = url.searchParams.get("order_id");
  const intentId = url.searchParams.get("intent_id");
  const { userId } = await auth();
  const baseUrl = getPublicAppOrigin();

  if (orderId !== null || intentId === null) {
    const order = userId ? await getOwnedProductReturnOrder(orderId, userId) : null;
    const outcome = getProductReturnOutcome(order);
    const redirectUrl = order && outcome !== PRODUCT_RETURN_OUTCOME.FAILURE
        ? `${baseUrl}/checkout/reconcile?order_id=${encodeURIComponent(order.id)}`
        : `${baseUrl}/checkout/${outcome}`;
    return NextResponse.redirect(redirectUrl);
  }

  const intent = userId ? await getOwnedCreditReturnIntent(intentId, userId) : null;
  const redirectUrl = intent && intent.status !== "cancelled"
    ? `${baseUrl}/credits/reconcile?intent_id=${encodeURIComponent(intent.id)}`
    : `${baseUrl}/credits`;
  return NextResponse.redirect(redirectUrl);
}
