"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createCoupon, deactivateCoupon, replaceCoupon, type AdminCoupon } from "@/lib/actions/coupon-admin";

const STATE_LABELS = { active: "Activo", deactivated: "Desactivado", replaced: "Reemplazado", replacement: "Reemplazo creado" } as const;

export function CouponLifecycle({ coupons }: { coupons: AdminCoupon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function run(action: () => Promise<{ error: string } | { success: boolean }>) {
    startTransition(async () => {
      const result = await action();
      setMessage("error" in result ? result.error : "Cambios guardados.");
      if ("success" in result) router.refresh();
    });
  }

  function submitCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const replacementId = String(formData.get("replacementCouponId") ?? "");
    run(() => replacementId ? replaceCoupon(replacementId, formData) : createCoupon(formData));
  }

  return (
    <div className="space-y-6">
      <form data-testid="coupon-create-form" onSubmit={submitCoupon} className="grid gap-3 rounded-lg border bg-background p-5 md:grid-cols-2">
        <input name="code" aria-label="Código" pattern="[A-Z0-9-]{3,64}" placeholder="CÓDIGO" required className="rounded-md border bg-transparent px-3 py-2" />
        <input name="capacity" aria-label="Capacidad" type="number" min="1" max="2147483647" placeholder="Capacidad" required className="rounded-md border bg-transparent px-3 py-2" />
        <input name="startsAt" aria-label="Inicio UTC" type="datetime-local" required className="rounded-md border bg-transparent px-3 py-2" />
        <input name="endsAt" aria-label="Fin UTC" type="datetime-local" required className="rounded-md border bg-transparent px-3 py-2" />
        <select name="discountKind" aria-label="Tipo de descuento" defaultValue="percentage" className="rounded-md border bg-transparent px-3 py-2"><option value="percentage">Porcentaje</option><option value="fixed_ars">Monto fijo ARS</option></select>
        <input name="discountValue" aria-label="Descuento" placeholder="1 a 50 o ARS" required className="rounded-md border bg-transparent px-3 py-2" />
        <select name="replacementCouponId" aria-label="Cupón a reemplazar" defaultValue="" className="rounded-md border bg-transparent px-3 py-2"><option value="">Crear cupón nuevo</option>{coupons.filter((coupon) => coupon.state === "active").map((coupon) => <option key={coupon.id} value={coupon.id}>Reemplazar {coupon.code}</option>)}</select>
        <input name="replacementReason" aria-label="Motivo de reemplazo" placeholder="Motivo requerido al reemplazar" className="rounded-md border bg-transparent px-3 py-2" />
        <button disabled={isPending} className="rounded-md bg-primary px-4 py-2 text-primary-foreground md:col-span-2">{isPending ? "Guardando..." : "Guardar cupón"}</button>
      </form>
      <p data-testid="coupon-feedback" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
      <div data-testid="coupon-list" className="space-y-3">
        {coupons.map((coupon) => (
          <article key={coupon.id} data-testid={`coupon-${coupon.id}`} className="rounded-lg border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{coupon.code}</strong><span data-testid={`coupon-state-${coupon.id}`} className="text-sm text-muted-foreground">{STATE_LABELS[coupon.state]}</span></div>
            <p className="mt-1 text-sm text-muted-foreground">{coupon.usedCount}/{coupon.capacity} usos · {new Date(coupon.startsAt).toLocaleString("es-AR")} a {new Date(coupon.endsAt).toLocaleString("es-AR")}</p>
            {coupon.state === "active" && <form onSubmit={(event) => { event.preventDefault(); run(() => deactivateCoupon(coupon.id, new FormData(event.currentTarget))); }} className="mt-3 flex gap-2"><input name="deactivationReason" aria-label={`Motivo de desactivación ${coupon.code}`} placeholder="Motivo de desactivación" maxLength={500} required className="rounded-md border bg-transparent px-3 py-2" /><button disabled={isPending} className="rounded-md border px-3 py-2">Desactivar</button></form>}
          </article>
        ))}
      </div>
    </div>
  );
}
