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
    <main className="container mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-16">
      <form
        action="/api/mp-return/credits/reconcile"
        className="w-full space-y-6 text-center"
        method="post"
        ref={formRef}
      >
        <input name="intent_id" type="hidden" value={intentId} />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl">Verificando el pago</h1>
          <p className="text-muted-foreground">
            Estamos confirmando el estado de tu compra de créditos. Esto puede demorar unos
            instantes.
          </p>
        </div>
        <button
          className="bg-primary px-5 py-3 text-sm font-medium uppercase tracking-widest text-primary-foreground"
          type="submit"
        >
          Verificar pago
        </button>
      </form>
    </main>
  );
}
