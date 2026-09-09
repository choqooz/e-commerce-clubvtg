import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  PRODUCT_RETURN_OUTCOME,
  getOwnedProductReturnOrder,
  getProductReturnOutcome,
} from "@/lib/payments/return-authority";
import { getPublicAppOrigin } from "@/lib/urls";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");
  const { userId } = await auth();
  const order = userId ? await getOwnedProductReturnOrder(orderId, userId) : null;
  const outcome = getProductReturnOutcome(order);

  const baseUrl = getPublicAppOrigin();
  const redirectUrl =
    order && outcome !== PRODUCT_RETURN_OUTCOME.FAILURE
        ? `${baseUrl}/checkout/reconcile?order_id=${encodeURIComponent(order.id)}`
        : `${baseUrl}/checkout/${outcome}`;

  return NextResponse.redirect(redirectUrl);
}
