"use client";

import { useEffect, useRef } from "react";

interface PaymentReconciliationHandoffProps {
  orderId: string;
}

interface SubmissionFlag {
  current: boolean;
}

export function submitPaymentReconciliationOnce(form: Pick<HTMLFormElement, "requestSubmit"> | null, submitted: SubmissionFlag) {
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
    <main className="container mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-16">
      <form action="/api/mp-return/reconcile" className="w-full space-y-6 text-center" method="post" ref={formRef}>
        <input name="order_id" type="hidden" value={orderId} />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl">Verificando el pago</h1>
          <p className="text-muted-foreground">Estamos confirmando el estado de tu compra. Esto puede demorar unos instantes.</p>
        </div>
        <button className="bg-primary px-5 py-3 text-sm font-medium uppercase tracking-widest text-primary-foreground" type="submit">
          Verificar pago
        </button>
      </form>
    </main>
  );
}
