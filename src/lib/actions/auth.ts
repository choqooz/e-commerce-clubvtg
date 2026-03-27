"use server";

import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Verify the current user is authenticated AND is an admin.
 * Returns an error object if unauthorized, or null if authorized.
 */
export async function requireAdmin(): Promise<{ error: string } | null> {
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
    (e) => e.id === user.primaryEmailAddressId,
  )?.emailAddress;

  if (!primaryEmail || primaryEmail !== adminEmail) {
    return { error: "No tenés permisos de administrador." };
  }

  return null;
}
