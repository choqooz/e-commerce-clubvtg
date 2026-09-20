import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runNewlyAppliedCreditPaymentEffects } from "@/lib/payments/first-effects";
import {
  PROCESS_PAYMENT_RESULT,
  processPaymentDetails,
  searchPaymentIdsByReference,
} from "@/lib/payments/mercadopago";
import { getOwnedCreditReturnIntent, isCreditIntentId } from "@/lib/payments/return-authority";
import { hasTrustedPublicOrigin } from "@/lib/payments/trusted-public-origin";
import { getPublicAppOrigin } from "@/lib/urls";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function reject(status: 400 | 401 | 403 | 404) {
  return NextResponse.json(
    { error: "Invalid reconciliation request" },
    { headers: NO_STORE_HEADERS, status },
  );
}

function redirectToCredits() {
  return NextResponse.redirect(`${getPublicAppOrigin()}/credits`, {
    headers: NO_STORE_HEADERS,
    status: 303,
  });
}

function reportReconciliationIssue(
  issue: "search_unavailable" | "settlement" | "settlement_intent_mismatch",
) {
  console.warn("[mp-return] credit reconciliation issue", { issue });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return reject(401);

  if (!hasTrustedPublicOrigin(request.headers.get("origin"))) return reject(403);

  let intentId: string | null;
  try {
    const formData = await request.formData();
    const value = formData.get("intent_id");
    intentId = typeof value === "string" ? value : null;
  } catch {
    return reject(400);
  }
  if (!isCreditIntentId(intentId)) return reject(400);

  const intent = await getOwnedCreditReturnIntent(intentId, userId);
  if (!intent) return reject(404);

  if (intent.status === "pending") {
    const paymentIds = await searchPaymentIdsByReference(intent.reference);
    if (paymentIds === null) {
      reportReconciliationIssue("search_unavailable");
    } else {
      for (const paymentId of paymentIds) {
        const processing = await processPaymentDetails(paymentId);
        if (processing.result !== PROCESS_PAYMENT_RESULT.ACKNOWLEDGED) {
          reportReconciliationIssue("settlement");
          continue;
        }
        if (processing.settlement?.kind === "credits" && processing.settlement.newlyApplied) {
          if (processing.settlement.intentId === intent.id) {
            await runNewlyAppliedCreditPaymentEffects(processing.settlement);
          } else {
            reportReconciliationIssue("settlement_intent_mismatch");
          }
        }
      }
    }
  }

  await getOwnedCreditReturnIntent(intentId, userId);
  return redirectToCredits();
}
