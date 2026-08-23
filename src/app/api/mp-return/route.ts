import { NextResponse } from "next/server";
import { PRODUCT_RETURN_OUTCOME, getOwnedProductReturnOutcome } from "@/lib/payments/return-authority";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  throw new Error(
    "NEXT_PUBLIC_APP_URL env var is required in production. Set it in your .env file.",
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");
  const outcome = await getOwnedProductReturnOutcome(orderId);

  const baseUrl = getBaseUrl();
  const redirectUrl =
    outcome === PRODUCT_RETURN_OUTCOME.SUCCESS && orderId
      ? `${baseUrl}/checkout/success?order_id=${encodeURIComponent(orderId)}`
      : `${baseUrl}/checkout/${outcome}`;

  return NextResponse.redirect(redirectUrl);
}
