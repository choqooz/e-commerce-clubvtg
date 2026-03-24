"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCart } from "@/contexts/cart-context";
import { checkoutSchema, type CheckoutFormValues } from "@/lib/validations/checkout";
import { createCheckoutPreference } from "@/lib/actions/checkout";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CheckoutForm() {
  const { items, totalPrice } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // Create Order and MP Preference
      const res = await createCheckoutPreference(data, items);
      
      if (!res.success) {
        toast.error(res.error || "Ocurrió un error al procesar el pago");
        setIsSubmitting(false);
        return;
      }

      // Redirect to MercadoPago
      // Usamos siempre initPoint (incluso en dev) porque sandboxInitPoint suele entrar en bucles infinitos por bugs de MP.
      // Si usamos un token de prueba (TEST-...), el production initPoint detecta automáticamente que es Sandbox y te muestra el banner de "Modo de Prueba".
      const url = res.initPoint;
      
      if (url) {
        window.location.href = url;
      } else {
        toast.error("No se pudo obtener el link de pago");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error inesperado al conectar con MercadoPago");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-heading text-xl">Datos de Contacto</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Nombre Completo</label>
            <input 
              {...form.register("fullName")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="Juan Pérez"
              disabled={isSubmitting}
            />
            {form.formState.errors.fullName && <p className="text-destructive text-xs">{form.formState.errors.fullName.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Email</label>
            <input 
              {...form.register("email")}
              type="email"
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="juan@ejemplo.com"
              disabled={isSubmitting}
            />
            {form.formState.errors.email && <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">DNI</label>
            <input 
              {...form.register("dni")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="12345678"
              disabled={isSubmitting}
            />
            {form.formState.errors.dni && <p className="text-destructive text-xs">{form.formState.errors.dni.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Teléfono</label>
            <input 
              {...form.register("phone")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="11 1234 5678"
              disabled={isSubmitting}
            />
            {form.formState.errors.phone && <p className="text-destructive text-xs">{form.formState.errors.phone.message}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-6 border-t border-border">
        <h3 className="font-heading text-xl">Datos de Envío (Correo Argentino)</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2 col-span-2 md:col-span-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Calle</label>
            <input 
              {...form.register("street")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="Av. Rivadavia"
              disabled={isSubmitting}
            />
            {form.formState.errors.street && <p className="text-destructive text-xs">{form.formState.errors.street.message}</p>}
          </div>

          <div className="space-y-2 col-span-1">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Número</label>
            <input 
              {...form.register("number")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="1234"
              disabled={isSubmitting}
            />
            {form.formState.errors.number && <p className="text-destructive text-xs">{form.formState.errors.number.message}</p>}
          </div>

          <div className="space-y-2 col-span-1">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Piso/Dpto</label>
            <input 
              {...form.register("floorOrApt")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="4B (Opcional)"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 col-span-2 md:col-span-2">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Ciudad</label>
            <input 
              {...form.register("city")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="CABA"
              disabled={isSubmitting}
            />
            {form.formState.errors.city && <p className="text-destructive text-xs">{form.formState.errors.city.message}</p>}
          </div>

          <div className="space-y-2 col-span-1 md:col-span-1">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">Provincia</label>
            <input 
              {...form.register("province")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="Buenos Aires"
              disabled={isSubmitting}
            />
            {form.formState.errors.province && <p className="text-destructive text-xs">{form.formState.errors.province.message}</p>}
          </div>

          <div className="space-y-2 col-span-1 md:col-span-1">
            <label className="text-xs uppercase font-sans font-medium tracking-widest">CP</label>
            <input 
              {...form.register("zipCode")}
              className="w-full border border-border bg-transparent p-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              placeholder="1000"
              disabled={isSubmitting}
            />
            {form.formState.errors.zipCode && <p className="text-destructive text-xs">{form.formState.errors.zipCode.message}</p>}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || items.length === 0}
        className="w-full py-4 mt-8 bg-primary text-primary-foreground font-sans font-medium uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Iniciando Pago...
          </>
        ) : (
          "Pagar con MercadoPago"
        )}
      </button>

      <p className="text-xs text-center text-muted-foreground font-sans">
        Al proceder, serás redirigido al sitio seguro de MercadoPago.
      </p>
    </form>
  );
}
