"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/types";

/**
 * Verify the current user is authenticated AND is an admin.
 * Returns an error object if unauthorized, or null if authorized.
 */
async function requireAdmin(): Promise<{ error: string } | null> {
  const { userId } = await auth();
  if (!userId) {
    return { error: "No autenticado. Iniciá sesión para continuar." };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("ADMIN_EMAIL env var is not configured");
    return { error: "Error de configuración del servidor." };
  }

  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  if (!primaryEmail || primaryEmail !== adminEmail) {
    return { error: "No tenés permisos de administrador." };
  }

  return null;
}

const VALID_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "cancelled"];

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const authError = await requireAdmin();
  if (authError) return authError;

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Estado inválido" };
  }

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) return { error: error.message };

  revalidatePath("/admin/orders");
  return { success: true };
}
