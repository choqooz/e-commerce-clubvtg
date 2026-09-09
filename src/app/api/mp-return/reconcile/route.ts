import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CART_CLEAR_PROOF_COOKIE, CART_CLEAR_PROOF_MAX_AGE_SECONDS, CART_CLEAR_PROOF_PATH } from "@/lib/payments/cart-clear-proof";
import { runNewlyAppliedProductPaymentEffects } from "@/lib/payments/first-effects";
import {
  PROCESS_PAYMENT_RESULT,
  processPaymentDetails,
  searchProductPaymentIdsByReference,
} from "@/lib/payments/mercadopago";
import {
  PRODUCT_RETURN_OUTCOME,
  getOwnedProductReturnOrder,
  getProductReturnOutcome,
  isAuthoritativelyPaidProductReturn,
  isOrderId,
} from "@/lib/payments/return-authority";
import { hasTrustedPublicOrigin } from "@/lib/payments/trusted-public-origin";
import { getPublicAppOrigin } from "@/lib/urls";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function redirectForOutcome(
  orderId: string,
  outcome: (typeof PRODUCT_RETURN_OUTCOME)[keyof typeof PRODUCT_RETURN_OUTCOME],
  issueCartClearProof: boolean,
) {
  const baseUrl = getPublicAppOrigin();
  const destination = outcome === PRODUCT_RETURN_OUTCOME.SUCCESS
    ? `${baseUrl}/checkout/success?order_id=${encodeURIComponent(orderId)}`
    : `${baseUrl}/checkout/${outcome}`;
  const response = NextResponse.redirect(destination, { headers: NO_STORE_HEADERS, status: 303 });
  if (outcome === PRODUCT_RETURN_OUTCOME.SUCCESS && issueCartClearProof) {
    response.cookies.set(CART_CLEAR_PROOF_COOKIE, orderId, {
      httpOnly: true,
      maxAge: CART_CLEAR_PROOF_MAX_AGE_SECONDS,
      path: CART_CLEAR_PROOF_PATH,
      sameSite: "lax",
      secure: baseUrl.startsWith("https://"),
    });
  }
  return response;
}

function reject(status: 400 | 401 | 403 | 404) {
  return NextResponse.json({ error: "Invalid reconciliation request" }, { headers: NO_STORE_HEADERS, status });
}

function reportReconciliationIssue(issue: "search_unavailable" | "settlement" | "settlement_order_mismatch") {
  console.warn("[mp-return] reconciliation issue", { issue });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return reject(401);

  if (!hasTrustedPublicOrigin(request.headers.get("origin"))) return reject(403);

  let orderId: string | null;
  try {
    const formData = await request.formData();
    const value = formData.get("order_id");
    orderId = typeof value === "string" ? value : null;
  } catch {
    return reject(400);
  }
  if (!isOrderId(orderId)) return reject(400);

  const order = await getOwnedProductReturnOrder(orderId, userId);
  if (!order) return reject(404);

  const initialOutcome = getProductReturnOutcome(order);
  if (initialOutcome !== PRODUCT_RETURN_OUTCOME.PENDING) {
    return redirectForOutcome(order.id, initialOutcome, isAuthoritativelyPaidProductReturn(order));
  }

  if (typeof order.payment_reference === "string") {
    const paymentIds = await searchProductPaymentIdsByReference(order.payment_reference);
    if (paymentIds === null) {
      reportReconciliationIssue("search_unavailable");
    } else {
      for (const paymentId of paymentIds) {
        const processing = await processPaymentDetails(paymentId);
        if (processing.result !== PROCESS_PAYMENT_RESULT.ACKNOWLEDGED) {
          reportReconciliationIssue("settlement");
          continue;
        }
        if (processing.settlement?.kind === "product" && processing.settlement.newlyApplied) {
          if (processing.settlement.orderId === order.id) {
            await runNewlyAppliedProductPaymentEffects(order.id);
          } else {
            reportReconciliationIssue("settlement_order_mismatch");
          }
        }
      }
    }
  }

  const finalOrder = await getOwnedProductReturnOrder(orderId, userId);
  return redirectForOutcome(orderId, getProductReturnOutcome(finalOrder), isAuthoritativelyPaidProductReturn(finalOrder));
}
