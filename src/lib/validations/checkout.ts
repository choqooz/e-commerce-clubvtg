import { z } from "zod";

export const checkoutSchema = z.object({
  fullName: z.string().min(3, "El nombre completo es requerido"),
  email: z.string().email("Email inválido"),
  dni: z.string().min(7, "El DNI es inválido").max(9, "El DNI es inválido"),
  phone: z.string().min(8, "Teléfono inválido"),
  street: z.string().min(3, "La calle es requerida"),
  number: z.string().min(1, "El número es requerido"),
  floorOrApt: z.string().optional(),
  city: z.string().min(2, "La ciudad es requerida"),
  province: z.string().min(2, "La provincia es requerida"),
  zipCode: z.string().min(4, "Código postal requerido"),
});

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;

// ── Cart items validation for checkout action ──

const cartItemSchema = z.object({
  product: z.object({
    id: z.string().uuid("ID de producto inválido"),
  }),
  quantity: z.number().int().positive(),
});

export const checkoutItemsSchema = z
  .array(cartItemSchema)
  .min(1, "El carrito no puede estar vacío");

export type CheckoutCartItem = z.infer<typeof cartItemSchema>;
