"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  createCoupon,
  deactivateCoupon,
  replaceCoupon,
  type AdminCoupon,
} from "@/lib/actions/coupon-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT_CLASS =
  "h-[36px] w-full min-w-0 rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-sans text-[16px] font-normal leading-[1.2] text-midnight-ink outline-none md:text-[15px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink";
const STATE_LABELS = {
  active: "Activo",
  deactivated: "Desactivado",
  replaced: "Reemplazado",
  replacement: "Reemplazo creado",
} as const;

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
    run(() => (replacementId ? replaceCoupon(replacementId, formData) : createCoupon(formData)));
  }

  return (
    <div className="grid gap-[24px] font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink">
      <form
        data-testid="coupon-create-form"
        onSubmit={submitCoupon}
        className="grid min-w-0 gap-[13px] rounded-none border border-midnight-ink bg-warm-sand p-[13px] md:grid-cols-2"
      >
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-code">Código</Label>
          <Input
            id="coupon-code"
            name="code"
            aria-label="Código"
            pattern="[A-Z0-9-]{3,64}"
            placeholder="CÓDIGO"
            required
          />
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-capacity">Capacidad</Label>
          <Input
            id="coupon-capacity"
            name="capacity"
            aria-label="Capacidad"
            type="number"
            min="1"
            max="2147483647"
            placeholder="Capacidad"
            required
          />
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-startsAt">Inicio UTC</Label>
          <Input
            id="coupon-startsAt"
            name="startsAt"
            aria-label="Inicio UTC"
            type="datetime-local"
            required
          />
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-endsAt">Fin UTC</Label>
          <Input
            id="coupon-endsAt"
            name="endsAt"
            aria-label="Fin UTC"
            type="datetime-local"
            required
          />
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-discountKind">Tipo de descuento</Label>
          <select
            id="coupon-discountKind"
            name="discountKind"
            aria-label="Tipo de descuento"
            defaultValue="percentage"
            className={SELECT_CLASS}
          >
            <option value="percentage">Porcentaje</option>
            <option value="fixed_ars">Monto fijo ARS</option>
          </select>
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-discountValue">Descuento</Label>
          <Input
            id="coupon-discountValue"
            name="discountValue"
            aria-label="Descuento"
            placeholder="1 a 50 o ARS"
            required
          />
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-replacementCouponId">Cupón a reemplazar</Label>
          <select
            id="coupon-replacementCouponId"
            name="replacementCouponId"
            aria-label="Cupón a reemplazar"
            defaultValue=""
            className={SELECT_CLASS}
          >
            <option value="">Crear cupón nuevo</option>
            {coupons
              .filter((coupon) => coupon.state === "active")
              .map((coupon) => (
                <option key={coupon.id} value={coupon.id}>
                  Reemplazar {coupon.code}
                </option>
              ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-[6px]">
          <Label htmlFor="coupon-replacementReason">Motivo de reemplazo</Label>
          <Input
            id="coupon-replacementReason"
            name="replacementReason"
            aria-label="Motivo de reemplazo"
            placeholder="Motivo requerido al reemplazar"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          className="w-full md:col-span-2 md:w-auto md:justify-self-start"
        >
          {isPending ? "Guardando..." : "Guardar cupón"}
        </Button>
      </form>
      <p data-testid="coupon-feedback" aria-live="polite" className="break-words">
        {message}
      </p>
      <div data-testid="coupon-list" className="grid min-w-0 gap-[13px]">
        {coupons.map((coupon) => (
          <article
            key={coupon.id}
            data-testid={`coupon-${coupon.id}`}
            className="grid min-w-0 gap-[13px] rounded-none border border-midnight-ink bg-bone-white p-[13px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-[6px] font-mono text-[13px] font-normal leading-[1.2]">
              <span className="break-all">{coupon.code}</span>
              <span data-testid={`coupon-state-${coupon.id}`}>{STATE_LABELS[coupon.state]}</span>
            </div>
            <p>
              {coupon.usedCount}/{coupon.capacity} usos ·{" "}
              {new Date(coupon.startsAt).toLocaleString("es-AR")} a{" "}
              {new Date(coupon.endsAt).toLocaleString("es-AR")}
            </p>
            {coupon.state === "active" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => deactivateCoupon(coupon.id, new FormData(event.currentTarget)));
                }}
                className="flex min-w-0 flex-col gap-[13px] md:flex-row md:items-end"
              >
                <div className="grid min-w-0 flex-1 gap-[6px]">
                  <Label htmlFor={`coupon-deactivation-${coupon.id}`}>
                    Motivo de desactivación {coupon.code}
                  </Label>
                  <Input
                    id={`coupon-deactivation-${coupon.id}`}
                    name="deactivationReason"
                    aria-label={`Motivo de desactivación ${coupon.code}`}
                    placeholder="Motivo de desactivación"
                    maxLength={500}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isPending}
                  className="w-full md:w-auto"
                >
                  Desactivar
                </Button>
              </form>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
