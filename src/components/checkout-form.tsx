"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CouponSelection } from "@/components/coupon-selection";
import { useCart } from "@/contexts/cart-context";
import { createCheckoutPreference } from "@/lib/actions/checkout";
import { checkoutStartedEvent } from "@/lib/analytics-events";
import { registerCheckoutBfcacheReset } from "@/lib/checkout-bfcache";
import { toCouponCheckoutSelection } from "@/lib/coupon-choice";
import { checkoutSchema, type CheckoutFormValues } from "@/lib/validations/checkout";

export function CheckoutForm() {
  const { couponCode, couponSource, items, totalPrice } = useCart();
  const posthog = usePostHog();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => registerCheckoutBfcacheReset(window, setIsSubmitting), []);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: "",
      email: "",
      dni: "",
      phone: "",
      street: "",
      number: "",
      floorOrApt: "",
      city: "",
      province: "",
      zipCode: "",
    },
  });

  const onSubmit = async (data: CheckoutFormValues) => {
    if (items.length === 0) {
      toast.error("Tu carrito está vacío");
      return;
    }

    setIsSubmitting(true);
    try {
      const event = checkoutStartedEvent(items.length, totalPrice);
      posthog?.capture(event.event, event.properties);
      // Create Order and MP Preference
      const res = await createCheckoutPreference(
        data,
        items,
        toCouponCheckoutSelection({ couponCode, source: couponSource }),
      );

      if (!res.success) {
        toast.error(res.error || "Ocurrió un error al procesar el pago");
        setIsSubmitting(false);
        return;
      }

      if (res.resumed) {
        toast.info(
          "Hay un pago pendiente. Retomaremos la misma orden con los datos de envío, contacto y precio originales.",
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // Redirect to MercadoPago
      // Usamos siempre initPoint (incluso en dev) porque sandboxInitPoint suele entrar en bucles infinitos por bugs de MP.
      // Si usamos un token de prueba (TEST-...), el production initPoint detecta automáticamente que es Sandbox y te muestra el banner de "Modo de Prueba".
      const url = res.initPoint;

      if (url) {
        window.location.assign(url);
      } else {
        toast.error("No se pudo obtener el link de pago");
        setIsSubmitting(false);
      }
    } catch {
      toast.error("Ocurrió un error inesperado al conectar con MercadoPago");
      setIsSubmitting(false);
    }
  };

  return (
    <form
      data-testid="checkout-form"
      aria-busy={isSubmitting}
      onSubmit={form.handleSubmit(onSubmit)}
      className="min-w-0 space-y-[42px] font-sans font-normal text-[15px] leading-[1.5] text-midnight-ink"
    >
      <fieldset className="min-w-0 space-y-[24px]">
        <legend className="mb-[24px] font-sans font-normal text-[24px] leading-[1.3]">
          Datos de Contacto
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
          <div className="min-w-0 space-y-[6px]">
            <label
              htmlFor="checkout-fullName"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Nombre Completo
            </label>
            <input
              {...form.register("fullName")}
              id="checkout-fullName"
              aria-label="Nombre Completo"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              aria-describedby={
                form.formState.errors.fullName ? "checkout-fullName-error" : undefined
              }
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Juan Pérez"
              disabled={isSubmitting}
            />
            {form.formState.errors.fullName && (
              <p
                id="checkout-fullName-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.fullName.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label
              htmlFor="checkout-email"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Email
            </label>
            <input
              {...form.register("email")}
              id="checkout-email"
              aria-label="Email"
              aria-invalid={Boolean(form.formState.errors.email)}
              aria-describedby={form.formState.errors.email ? "checkout-email-error" : undefined}
              type="email"
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="juan@ejemplo.com"
              disabled={isSubmitting}
            />
            {form.formState.errors.email && (
              <p
                id="checkout-email-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label
              htmlFor="checkout-dni"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              DNI
            </label>
            <input
              {...form.register("dni")}
              id="checkout-dni"
              aria-label="DNI"
              aria-invalid={Boolean(form.formState.errors.dni)}
              aria-describedby={form.formState.errors.dni ? "checkout-dni-error" : undefined}
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="12345678"
              disabled={isSubmitting}
            />
            {form.formState.errors.dni && (
              <p
                id="checkout-dni-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.dni.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label
              htmlFor="checkout-phone"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Teléfono
            </label>
            <input
              {...form.register("phone")}
              id="checkout-phone"
              aria-label="Teléfono"
              aria-invalid={Boolean(form.formState.errors.phone)}
              aria-describedby={form.formState.errors.phone ? "checkout-phone-error" : undefined}
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="11 1234 5678"
              disabled={isSubmitting}
            />
            {form.formState.errors.phone && (
              <p
                id="checkout-phone-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.phone.message}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-[24px] border-t border-midnight-ink pt-[30px]">
        <legend className="mb-[24px] pr-[18px] font-sans font-normal text-[24px] leading-[1.3]">
          Datos de Envío (Correo Argentino)
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-[24px]">
          <div className="min-w-0 space-y-[6px] col-span-1 sm:col-span-2 md:col-span-2">
            <label
              htmlFor="checkout-street"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Calle
            </label>
            <input
              {...form.register("street")}
              id="checkout-street"
              aria-label="Calle"
              aria-invalid={Boolean(form.formState.errors.street)}
              aria-describedby={form.formState.errors.street ? "checkout-street-error" : undefined}
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Av. Rivadavia"
              disabled={isSubmitting}
            />
            {form.formState.errors.street && (
              <p
                id="checkout-street-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.street.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1">
            <label
              htmlFor="checkout-number"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Número
            </label>
            <input
              {...form.register("number")}
              id="checkout-number"
              aria-label="Número"
              aria-invalid={Boolean(form.formState.errors.number)}
              aria-describedby={form.formState.errors.number ? "checkout-number-error" : undefined}
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="1234"
              disabled={isSubmitting}
            />
            {form.formState.errors.number && (
              <p
                id="checkout-number-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.number.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1">
            <label
              htmlFor="checkout-floorOrApt"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Piso/Dpto
            </label>
            <input
              {...form.register("floorOrApt")}
              id="checkout-floorOrApt"
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="4B (Opcional)"
              disabled={isSubmitting}
            />
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1 sm:col-span-2 md:col-span-2">
            <label
              htmlFor="checkout-city"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Ciudad
            </label>
            <input
              {...form.register("city")}
              id="checkout-city"
              aria-label="Ciudad"
              aria-invalid={Boolean(form.formState.errors.city)}
              aria-describedby={form.formState.errors.city ? "checkout-city-error" : undefined}
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="CABA"
              disabled={isSubmitting}
            />
            {form.formState.errors.city && (
              <p
                id="checkout-city-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.city.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1 md:col-span-1">
            <label
              htmlFor="checkout-province"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              Provincia
            </label>
            <input
              {...form.register("province")}
              id="checkout-province"
              aria-label="Provincia"
              aria-invalid={Boolean(form.formState.errors.province)}
              aria-describedby={
                form.formState.errors.province ? "checkout-province-error" : undefined
              }
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Buenos Aires"
              disabled={isSubmitting}
            />
            {form.formState.errors.province && (
              <p
                id="checkout-province-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.province.message}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1 md:col-span-1">
            <label
              htmlFor="checkout-zipCode"
              className="block text-[13px] uppercase font-mono font-normal"
            >
              CP
            </label>
            <input
              {...form.register("zipCode")}
              id="checkout-zipCode"
              aria-label="CP"
              aria-invalid={Boolean(form.formState.errors.zipCode)}
              aria-describedby={
                form.formState.errors.zipCode ? "checkout-zipCode-error" : undefined
              }
              className="w-full min-w-0 h-[48px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[12px] text-[16px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="1000"
              disabled={isSubmitting}
            />
            {form.formState.errors.zipCode && (
              <p
                id="checkout-zipCode-error"
                aria-live="polite"
                className="text-midnight-ink text-[15px] leading-[1.5] border-l-2 border-midnight-ink pl-[13px] py-[6px]"
              >
                {form.formState.errors.zipCode.message}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <CouponSelection />

      <button
        type="submit"
        disabled={isSubmitting || items.length === 0}
        className="w-full min-h-[48px] py-[12px] px-[18px] mt-[30px] border border-midnight-ink bg-midnight-ink text-bone-white font-mono text-[13px] font-normal uppercase flex items-center justify-center gap-[13px] hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-[20px] w-[20px] animate-spin" />
            Iniciando Pago...
          </>
        ) : (
          "Pagar con MercadoPago"
        )}
      </button>

      <p className="mx-auto max-w-[48ch] text-[13px] leading-[1.5] text-center text-midnight-ink font-mono">
        Al proceder, serás redirigido al sitio seguro de MercadoPago.
      </p>
    </form>
  );
}
