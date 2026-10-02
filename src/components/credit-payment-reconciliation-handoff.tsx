"use client";

import { useEffect, useRef } from "react";

interface CreditPaymentReconciliationHandoffProps {
  intentId: string;
}

export function CreditPaymentReconciliationHandoff({
  intentId,
}: CreditPaymentReconciliationHandoffProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!formRef.current || submitted.current) return;
    submitted.current = true;
    formRef.current.requestSubmit();
  }, []);

  return (
    <main className="w-full mx-auto flex min-h-[60vh] max-w-[576px] items-center px-[18px] py-[42px] bg-bone-white text-midnight-ink font-sans font-normal text-[15px] leading-[1.3]">
      <form
        action="/api/mp-return/credits/reconcile"
        className="w-full min-w-0 space-y-[24px] text-center"
        method="post"
        ref={formRef}
      >
        <input name="intent_id" type="hidden" value={intentId} />
        <div className="space-y-[6px]">
          <h1 className="font-sans font-normal text-[30px] leading-[1.2]">Verificando el pago</h1>
          <p className="text-midnight-ink">
            Estamos confirmando el estado de tu compra de créditos. Esto puede demorar unos
            instantes.
          </p>
        </div>
        <button
          className="min-h-[36px] rounded-none border border-midnight-ink bg-midnight-ink px-[6px] py-[2px] text-[13px] font-mono font-normal uppercase text-bone-white hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
          type="submit"
        >
          Verificar pago
        </button>
      </form>
    </main>
  );
}
