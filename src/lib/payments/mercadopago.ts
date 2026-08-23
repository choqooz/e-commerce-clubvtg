import "server-only";

const PAYMENT_EVENT_CLASS = {
  APPROVED: "approved",
  CANCELLED: "cancelled",
  CHARGED_BACK: "charged_back",
  PENDING: "pending",
  REFUNDED: "refunded",
  REJECTED: "rejected",
} as const;

const ACKNOWLEDGED_RESULTS = new Set([
  "applied",
  "cancelled",
  "duplicate_event",
  "duplicate_payment",
  "illegal_order_state",
  "invalid_event",
  "invalid_payment",
  "late_approval_manual_review",
  "manual_review_required",
  "payment_mismatch",
  "payment_reused",
  "pending_ignored",
  "unknown_order",
]);

const PAYMENT_ID = /^[1-9]\d{0,17}$/;
const ORDER_REFERENCE = /^order:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;

type PaymentEventClass = (typeof PAYMENT_EVENT_CLASS)[keyof typeof PAYMENT_EVENT_CLASS];

interface PaymentFacts {
  amount: number;
  currency: "ARS";
  eventClass: PaymentEventClass;
  paymentId: string;
  reference: string;
}

interface SettlementArguments {
  p_amount: number;
  p_currency: "ARS";
  p_event_class: PaymentEventClass;
  p_payment_id: string;
  p_provider: "mercadopago";
  p_reference: string;
}

interface PaymentProvider {
  get(input: { id: string }): Promise<unknown>;
}

interface SettlementClient {
  rpc(name: "settle_product_payment", args: SettlementArguments): PromiseLike<{ data: unknown; error: unknown }>;
}

interface PaymentDependencies {
  provider: PaymentProvider;
  settlement: SettlementClient;
}

export const PROCESS_PAYMENT_RESULT = {
  ACKNOWLEDGED: "acknowledged",
  INVALID: "invalid",
  RETRY: "retry",
} as const;

export type ProcessPaymentResult = (typeof PROCESS_PAYMENT_RESULT)[keyof typeof PROCESS_PAYMENT_RESULT];

export function isCandidatePaymentId(value: string | null): value is string {
  return value !== null && PAYMENT_ID.test(value);
}

function paymentId(value: unknown): string | null {
  if (typeof value === "string" && PAYMENT_ID.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && PAYMENT_ID.test(String(value))) return String(value);
  return null;
}

function paymentFacts(candidateId: string, value: unknown): PaymentFacts | null {
  if (typeof value !== "object" || value === null) return null;
  const payment = value as Record<string, unknown>;
  const id = paymentId(payment.id);
  const status = typeof payment.status === "string" ? payment.status : null;
  const reference = typeof payment.external_reference === "string" ? payment.external_reference : null;
  const amount = payment.transaction_amount;

  if (
    id !== candidateId ||
    !status ||
    !Object.values(PAYMENT_EVENT_CLASS).includes(status as PaymentEventClass) ||
    !reference ||
    !ORDER_REFERENCE.test(reference) ||
    payment.currency_id !== "ARS" ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > MAX_AMOUNT
  ) {
    return null;
  }

  return { amount, currency: "ARS", eventClass: status as PaymentEventClass, paymentId: id, reference };
}

function acknowledgedSettlement(data: unknown): boolean {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const result = data[0];
  return (
    typeof result === "object" &&
    result !== null &&
    typeof (result as Record<string, unknown>).newly_applied === "boolean" &&
    typeof (result as Record<string, unknown>).result === "string" &&
    ACKNOWLEDGED_RESULTS.has((result as Record<string, string>).result)
  );
}

async function defaultDependencies(): Promise<PaymentDependencies> {
  const [{ Payment }, { mpClient }, { supabaseAdmin }] = await Promise.all([
    import("mercadopago"),
    import("../mercadopago"),
    import("../supabase/admin"),
  ]);
  const payment = new Payment(mpClient);
  return { provider: { get: ({ id }) => payment.get({ id }) }, settlement: supabaseAdmin };
}

export async function processProductPayment(
  candidateId: string,
  dependencies?: PaymentDependencies,
): Promise<ProcessPaymentResult> {
  if (!isCandidatePaymentId(candidateId)) return PROCESS_PAYMENT_RESULT.INVALID;

  let deps: PaymentDependencies;
  let providerPayment: unknown;
  try {
    deps = dependencies ?? (await defaultDependencies());
    providerPayment = await deps.provider.get({ id: candidateId });
  } catch {
    return PROCESS_PAYMENT_RESULT.RETRY;
  }

  const facts = paymentFacts(candidateId, providerPayment);
  if (!facts) return PROCESS_PAYMENT_RESULT.INVALID;

  try {
    const { data, error } = await deps.settlement.rpc("settle_product_payment", {
      p_amount: facts.amount,
      p_currency: facts.currency,
      p_event_class: facts.eventClass,
      p_payment_id: facts.paymentId,
      p_provider: "mercadopago",
      p_reference: facts.reference,
    });
    return error || !acknowledgedSettlement(data) ? PROCESS_PAYMENT_RESULT.RETRY : PROCESS_PAYMENT_RESULT.ACKNOWLEDGED;
  } catch {
    return PROCESS_PAYMENT_RESULT.RETRY;
  }
}
