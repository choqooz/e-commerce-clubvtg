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
const CREDIT_REFERENCE = /^credits:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
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

interface CreditSettlementArguments {
  p_amount: number;
  p_currency: "ARS";
  p_payment_id: string;
  p_provider: "mercadopago";
  p_reference: string;
  p_user_id: string;
}

interface PaymentProvider {
  get(input: { id: string }): Promise<unknown>;
}

interface SettlementClient {
  from(table: "credit_purchase_intents"): {
    select(columns: string): { eq(column: "reference", value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
  };
  rpc(name: "settle_product_payment" | "settle_credit_payment", args: SettlementArguments | CreditSettlementArguments): PromiseLike<{ data: unknown; error: unknown }>;
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

interface ProductSettlement {
  kind: "product";
  newlyApplied: boolean;
  orderId: string | null;
}

export interface AppliedCreditSettlement {
  credits: number;
  intentId: string;
  kind: "credits";
  mpPaymentId: string;
  newlyApplied: true;
  packId: string;
  purchaseUserId: string;
  totalAmount: number;
}

interface CreditSettlementNoop {
  kind: "credits";
  newlyApplied: false;
}

type CreditSettlement = AppliedCreditSettlement | CreditSettlementNoop;
type PersistedSettlement = ProductSettlement | CreditSettlement;

export const PAYMENT_PROCESSING_ISSUE = {
  CREDIT_INTENT_LOOKUP: "credit_intent_lookup",
  CREDIT_SETTLEMENT: "credit_settlement",
  INVALID_PROVIDER_FACTS: "invalid_provider_facts",
  PRODUCT_SETTLEMENT: "product_settlement",
  PROVIDER_FETCH: "provider_fetch",
} as const;

type PaymentProcessingIssue = (typeof PAYMENT_PROCESSING_ISSUE)[keyof typeof PAYMENT_PROCESSING_ISSUE];

interface PaymentProcessing {
  issue?: PaymentProcessingIssue;
  result: ProcessPaymentResult;
  settlement: PersistedSettlement | null;
}

interface CreditIntent {
  amount: number;
  credits: number;
  currency: "ARS";
  id: string;
  packId: string;
  userId: string;
}

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
    (!ORDER_REFERENCE.test(reference) && !CREDIT_REFERENCE.test(reference)) ||
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

function acknowledgedProductSettlement(data: unknown): ProductSettlement | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const result = data[0];
  if (
    typeof result === "object" &&
    result !== null &&
    typeof (result as Record<string, unknown>).newly_applied === "boolean" &&
    typeof (result as Record<string, unknown>).result === "string" &&
    ACKNOWLEDGED_RESULTS.has((result as Record<string, string>).result)
  ) {
    const orderId = (result as Record<string, unknown>).order_id;
    return {
      kind: "product",
      newlyApplied: (result as Record<string, boolean>).newly_applied,
      orderId: typeof orderId === "string" ? orderId : null,
    };
  }
  return null;
}

function creditIntent(value: unknown): CreditIntent | null {
  if (typeof value !== "object" || value === null) return null;
  const intent = value as Record<string, unknown>;
  return (
    typeof intent.id === "string" &&
    typeof intent.user_id === "string" &&
    typeof intent.pack_id === "string" &&
    typeof intent.amount === "number" &&
    Number.isFinite(intent.amount) &&
    intent.amount > 0 &&
    typeof intent.credits === "number" &&
    Number.isSafeInteger(intent.credits) &&
    intent.credits > 0 &&
    intent.currency === "ARS"
  )
    ? { amount: intent.amount, credits: intent.credits, currency: "ARS", id: intent.id, packId: intent.pack_id, userId: intent.user_id }
    : null;
}

function creditPackMatches(payment: unknown, packId: string): boolean {
  if (typeof payment !== "object" || payment === null) return false;
  const additionalInfo = (payment as Record<string, unknown>).additional_info;
  if (additionalInfo === undefined) return true;
  if (typeof additionalInfo !== "object" || additionalInfo === null) return false;
  const items = (additionalInfo as Record<string, unknown>).items;
  if (items === undefined) return true;
  return Array.isArray(items) && items.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const evidence = item as Record<string, unknown>;
    return evidence.id === `credit-pack-${packId}` && evidence.quantity === 1;
  }).length === 1;
}

function acknowledgedCreditSettlement(data: unknown): { newlyApplied: boolean } | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const result = data[0];
  if (
    typeof result !== "object" ||
    result === null ||
    typeof (result as Record<string, unknown>).newly_applied !== "boolean" ||
    !["applied", "duplicate_payment", "unknown_intent", "intent_mismatch", "invalid_payment"].includes((result as Record<string, unknown>).result as string)
  ) return null;
  return { newlyApplied: (result as Record<string, boolean>).newly_applied };
}

function acknowledgedCreditNoop(): PaymentProcessing {
  return { result: PROCESS_PAYMENT_RESULT.ACKNOWLEDGED, settlement: { kind: "credits", newlyApplied: false } };
}

async function defaultDependencies(): Promise<PaymentDependencies> {
  const [{ Payment }, { mpClient }, { supabaseAdmin }] = await Promise.all([
    import("mercadopago"),
    import("../mercadopago"),
    import("../supabase/admin"),
  ]);
  const payment = new Payment(mpClient);
  return { provider: { get: ({ id }) => payment.get({ id }) }, settlement: supabaseAdmin as unknown as SettlementClient };
}

async function loadPayment(candidateId: string, dependencies?: PaymentDependencies): Promise<{ deps: PaymentDependencies; payment: unknown } | null> {
  try {
    const deps = dependencies ?? (await defaultDependencies());
    return { deps, payment: await deps.provider.get({ id: candidateId }) };
  } catch {
    return null;
  }
}

async function settleProduct(facts: PaymentFacts, deps: PaymentDependencies): Promise<PaymentProcessing> {
  try {
    const { data, error } = await deps.settlement.rpc("settle_product_payment", {
      p_amount: facts.amount, p_currency: facts.currency, p_event_class: facts.eventClass, p_payment_id: facts.paymentId, p_provider: "mercadopago", p_reference: facts.reference,
    });
    const settlement = acknowledgedProductSettlement(data);
    return error || !settlement
      ? { issue: PAYMENT_PROCESSING_ISSUE.PRODUCT_SETTLEMENT, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null }
      : { result: PROCESS_PAYMENT_RESULT.ACKNOWLEDGED, settlement };
  } catch {
    return { issue: PAYMENT_PROCESSING_ISSUE.PRODUCT_SETTLEMENT, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  }
}

async function settleCredits(facts: PaymentFacts, payment: unknown, deps: PaymentDependencies): Promise<PaymentProcessing> {
  if (facts.eventClass !== PAYMENT_EVENT_CLASS.APPROVED) return { result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null };
  let response: { data: unknown; error: unknown };
  try {
    response = await deps.settlement.from("credit_purchase_intents").select("id, user_id, pack_id, credits, amount, currency").eq("reference", facts.reference).maybeSingle();
  } catch {
    return { issue: PAYMENT_PROCESSING_ISSUE.CREDIT_INTENT_LOOKUP, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  }
  if (response.error) return { issue: PAYMENT_PROCESSING_ISSUE.CREDIT_INTENT_LOOKUP, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  if (response.data === null) return acknowledgedCreditNoop();
  const intent = creditIntent(response.data);
  if (!intent) {
    return typeof response.data === "object" && response.data !== null && (response.data as Record<string, unknown>).user_id === null
      ? acknowledgedCreditNoop()
      : { issue: PAYMENT_PROCESSING_ISSUE.CREDIT_INTENT_LOOKUP, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  }
  if (intent.amount !== facts.amount || intent.currency !== facts.currency || !creditPackMatches(payment, intent.packId)) {
    return { issue: PAYMENT_PROCESSING_ISSUE.INVALID_PROVIDER_FACTS, result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null };
  }

  try {
    const { data, error } = await deps.settlement.rpc("settle_credit_payment", {
      p_amount: facts.amount, p_currency: facts.currency, p_payment_id: facts.paymentId, p_provider: "mercadopago", p_reference: facts.reference, p_user_id: intent.userId,
    });
    const settlement = acknowledgedCreditSettlement(data);
    if (error || !settlement) {
      return { issue: PAYMENT_PROCESSING_ISSUE.CREDIT_SETTLEMENT, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
    }
    return settlement.newlyApplied
      ? {
        result: PROCESS_PAYMENT_RESULT.ACKNOWLEDGED,
        settlement: {
          credits: intent.credits,
          intentId: intent.id,
          kind: "credits",
          mpPaymentId: facts.paymentId,
          newlyApplied: true,
          packId: intent.packId,
          purchaseUserId: intent.userId,
          totalAmount: facts.amount,
        },
      }
      : acknowledgedCreditNoop();
  } catch {
    return { issue: PAYMENT_PROCESSING_ISSUE.CREDIT_SETTLEMENT, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  }
}

export async function processPaymentDetails(candidateId: string, dependencies?: PaymentDependencies): Promise<PaymentProcessing> {
  if (!isCandidatePaymentId(candidateId)) return { result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null };
  const loaded = await loadPayment(candidateId, dependencies);
  if (!loaded) return { issue: PAYMENT_PROCESSING_ISSUE.PROVIDER_FETCH, result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  const facts = paymentFacts(candidateId, loaded.payment);
  if (!facts) return { issue: PAYMENT_PROCESSING_ISSUE.INVALID_PROVIDER_FACTS, result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null };
  return ORDER_REFERENCE.test(facts.reference) ? settleProduct(facts, loaded.deps) : settleCredits(facts, loaded.payment, loaded.deps);
}

export async function processProductPaymentDetails(candidateId: string, dependencies?: PaymentDependencies): Promise<PaymentProcessing> {
  if (!isCandidatePaymentId(candidateId)) return { result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null };
  const loaded = await loadPayment(candidateId, dependencies);
  if (!loaded) return { result: PROCESS_PAYMENT_RESULT.RETRY, settlement: null };
  const facts = paymentFacts(candidateId, loaded.payment);
  return !facts || !ORDER_REFERENCE.test(facts.reference)
    ? { result: PROCESS_PAYMENT_RESULT.INVALID, settlement: null }
    : settleProduct(facts, loaded.deps);
}

export async function processProductPayment(
  candidateId: string,
  dependencies?: PaymentDependencies,
): Promise<ProcessPaymentResult> {
  return (await processProductPaymentDetails(candidateId, dependencies)).result;
}
