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
      const res = await createCheckoutPreference(data, items, toCouponCheckoutSelection({ couponCode, source: couponSource }));

      if (!res.success) {
        toast.error(res.error || "Ocurrió un error al procesar el pago");
        setIsSubmitting(false);
        return;
      }

      if (res.resumed) {
        toast.info("Hay un pago pendiente. Retomaremos la misma orden con los datos de envío, contacto y precio originales.");
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
    <form data-testid="checkout-form" onSubmit={form.handleSubmit(onSubmit)} className="min-w-0 space-y-[24px] font-sans font-normal text-[15px] leading-[1.3] text-midnight-ink">
      <div className="space-y-[18px]">
        <h3 className="font-sans font-normal text-[20px]">Datos de Contacto</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
          <div className="min-w-0 space-y-[6px]">
            <label className="text-[13px] uppercase font-mono font-normal">
              Nombre Completo
            </label>
            <input
              {...form.register("fullName")}
              aria-label="Nombre Completo"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Juan Pérez"
              disabled={isSubmitting}
            />
            {form.formState.errors.fullName && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label className="text-[13px] uppercase font-mono font-normal">Email</label>
            <input
              {...form.register("email")}
              aria-label="Email"
              type="email"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="juan@ejemplo.com"
              disabled={isSubmitting}
            />
            {form.formState.errors.email && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label className="text-[13px] uppercase font-mono font-normal">DNI</label>
            <input
              {...form.register("dni")}
              aria-label="DNI"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="12345678"
              disabled={isSubmitting}
            />
            {form.formState.errors.dni && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.dni.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px]">
            <label className="text-[13px] uppercase font-mono font-normal">
              Teléfono
            </label>
            <input
              {...form.register("phone")}
              aria-label="Teléfono"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="11 1234 5678"
              disabled={isSubmitting}
            />
            {form.formState.errors.phone && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.phone.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-[18px] pt-[24px] border-t border-midnight-ink">
        <h3 className="font-sans font-normal text-[20px]">Datos de Envío (Correo Argentino)</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[18px]">
          <div className="min-w-0 space-y-[6px] col-span-2 md:col-span-2">
            <label className="text-[13px] uppercase font-mono font-normal">Calle</label>
            <input
              {...form.register("street")}
              aria-label="Calle"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Av. Rivadavia"
              disabled={isSubmitting}
            />
            {form.formState.errors.street && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.street.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1">
            <label className="text-[13px] uppercase font-mono font-normal">
              Número
            </label>
            <input
              {...form.register("number")}
              aria-label="Número"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="1234"
              disabled={isSubmitting}
            />
            {form.formState.errors.number && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.number.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1">
            <label className="text-[13px] uppercase font-mono font-normal">
              Piso/Dpto
            </label>
            <input
              {...form.register("floorOrApt")}
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="4B (Opcional)"
              disabled={isSubmitting}
            />
          </div>

          <div className="min-w-0 space-y-[6px] col-span-2 md:col-span-2">
            <label className="text-[13px] uppercase font-mono font-normal">
              Ciudad
            </label>
            <input
              {...form.register("city")}
              aria-label="Ciudad"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="CABA"
              disabled={isSubmitting}
            />
            {form.formState.errors.city && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.city.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1 md:col-span-1">
            <label className="text-[13px] uppercase font-mono font-normal">
              Provincia
            </label>
            <input
              {...form.register("province")}
              aria-label="Provincia"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Buenos Aires"
              disabled={isSubmitting}
            />
            {form.formState.errors.province && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.province.message}</p>
            )}
          </div>

          <div className="min-w-0 space-y-[6px] col-span-1 md:col-span-1">
            <label className="text-[13px] uppercase font-mono font-normal">CP</label>
            <input
              {...form.register("zipCode")}
              aria-label="CP"
              className="w-full min-w-0 h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] text-[16px] md:text-[15px] font-sans font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="1000"
              disabled={isSubmitting}
            />
            {form.formState.errors.zipCode && (
              <p className="text-midnight-ink text-[13px] border-l border-dotted border-midnight-ink pl-[6px]">{form.formState.errors.zipCode.message}</p>
            )}
          </div>
        </div>
      </div>

      <CouponSelection />

      <button
        type="submit"
        disabled={isSubmitting || items.length === 0}
        className="w-full min-h-[36px] py-[2px] px-[6px] mt-[30px] border border-midnight-ink bg-midnight-ink text-bone-white font-mono text-[13px] font-normal uppercase flex items-center justify-center gap-[6px] hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2"
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

      <p className="text-[13px] text-center text-midnight-ink font-mono">
        Al proceder, serás redirigido al sitio seguro de MercadoPago.
      </p>
    </form>
  );
}
