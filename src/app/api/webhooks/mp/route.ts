import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNewlyAppliedProductPaymentEffects } from "@/lib/payments/first-effects";
import { PROCESS_PAYMENT_RESULT, isCandidatePaymentId, processProductPaymentDetails } from "../../../../lib/payments/mercadopago";

const RETRY_AFTER_SECONDS = "60";
const CANONICAL_HEX = /^[0-9a-f]+$/;

interface WebhookPayload {
  type?: unknown;
  status?: unknown;
  data?: {
    id?: unknown;
  };
}

function reject(error: string, status: 400 | 401) {
  return NextResponse.json({ error }, { status });
}

function temporarilyUnavailable() {
  return NextResponse.json(
    {
      error: "Product payment settlement is temporarily unavailable",
      retryable: true,
    },
    {
      status: 503,
      headers: { "Retry-After": RETRY_AFTER_SECONDS },
    },
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function verifyMPSignature(
  xSignature: string,
  xRequestId: string,
  paymentId: string,
  secret: string,
): boolean {
  const parts = new Map(
    xSignature.split(",").map((part) => {
      const [key, value] = part.trim().split("=", 2);
      return [key, value] as const;
    }),
  );
  const timestamp = parts.get("ts");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  if (signature.length !== expected.length * 2 || !CANONICAL_HEX.test(signature)) return false;
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  let body: WebhookPayload;
  try {
    body = (await request.json()) as WebhookPayload;
  } catch {
    return reject("Malformed webhook payload", 400);
  }

  const url = new URL(request.url);
  const queryPaymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const bodyPaymentId = stringValue(body.data?.id);
  const queryType = url.searchParams.get("type");
  const bodyType = stringValue(body.type);

  if (
    (queryPaymentId && bodyPaymentId && queryPaymentId !== bodyPaymentId) ||
    (queryType && bodyType && queryType !== bodyType)
  ) {
    return reject("Conflicting webhook payload", 400);
  }

  const paymentId = queryPaymentId ?? bodyPaymentId;
  const type = queryType ?? bodyType;
  if (type !== "payment" || !isCandidatePaymentId(paymentId)) {
    return reject("Unsupported webhook notification", 400);
  }
  if (body.status !== undefined || url.searchParams.has("status")) {
    return reject("Unsupported webhook status", 400);
  }

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return temporarilyUnavailable();

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signature || !requestId || !verifyMPSignature(signature, requestId, paymentId, secret)) {
    return reject("Invalid webhook signature", 401);
  }

  const processing = await processProductPaymentDetails(paymentId);
  if (processing.result === PROCESS_PAYMENT_RESULT.ACKNOWLEDGED) {
    if (processing.settlement?.newlyApplied && processing.settlement.orderId) {
      await runNewlyAppliedProductPaymentEffects(processing.settlement.orderId);
    }
    return NextResponse.json({ received: true });
  }
  if (processing.result === PROCESS_PAYMENT_RESULT.INVALID) {
    return reject("Invalid provider payment", 400);
  }
  return temporarilyUnavailable();
}
