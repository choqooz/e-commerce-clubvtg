"use client";

import { useEffect, useRef } from "react";

interface PaymentReconciliationHandoffProps {
  orderId: string;
}

interface SubmissionFlag {
  current: boolean;
}

export function submitPaymentReconciliationOnce(
  form: Pick<HTMLFormElement, "requestSubmit"> | null,
  submitted: SubmissionFlag,
) {
  if (!form || submitted.current) return;
  submitted.current = true;
  form.requestSubmit();
}

export function PaymentReconciliationHandoff({ orderId }: PaymentReconciliationHandoffProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    submitPaymentReconciliationOnce(formRef.current, submitted);
  }, []);

  return (
    <main className="w-full mx-auto flex min-h-[60vh] max-w-[828px] items-center px-[18px] md:px-[30px] py-[42px] md:py-[72px] bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]">
      <form
        action="/api/mp-return/reconcile"
        className="w-full min-w-0 space-y-[42px] border border-midnight-ink bg-warm-sand p-[24px] sm:p-[48px] text-left"
        method="post"
        ref={formRef}
      >
        <input name="order_id" type="hidden" value={orderId} />
        <div className="space-y-[24px]">
          <h1 className="max-w-[12ch] font-sans font-normal text-[42px] sm:text-[60px] leading-[1]">
            Verificando el pago
          </h1>
          <p className="max-w-[48ch] text-midnight-ink text-[18px] leading-[1.5]">
            Estamos confirmando el estado de tu compra. Esto puede demorar unos instantes.
          </p>
        </div>
        <button
          className="w-full sm:w-auto min-h-[48px] border border-midnight-ink bg-midnight-ink px-[24px] py-[12px] text-[13px] font-mono font-normal uppercase text-bone-white hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          type="submit"
        >
          Verificar pago
        </button>
      </form>
    </main>
  );
}
