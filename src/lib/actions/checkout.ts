"use server";

import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { Preference } from "mercadopago";
import { SHIPPING_FEE } from "@/lib/config";
import { mpClient } from "@/lib/mercadopago";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";
import { releaseExpiredReservations } from "@/lib/supabase/release-reservations";
import type { CartItem } from "@/lib/types";
import { resolvePaymentUrls } from "@/lib/urls";
import { type CheckoutFormValues, checkoutItemsSchema } from "@/lib/validations/checkout";

export async function createCheckoutPreference(data: CheckoutFormValues, items: CartItem[]) {
  try {
    const { userId } = await auth();

    // Lazy release: free any products reserved >15 min before checking availability
    await releaseExpiredReservations();

    // Validate cart items shape before touching the DB
    const parsed = checkoutItemsSchema.safeParse(items);
    if (!parsed.success) {
      return { success: false, error: "Datos del carrito inválidos" };
    }

    // 1. Validate items are still available
    const productIds = items.map((item) => item.product.id);
    const { data: dbProducts, error: prodErr } = await supabase
      .from("products")
      .select("id, status, price, title")
      .in("id", productIds);

    if (prodErr || !dbProducts) {
      throw new Error("No se pudieron verificar los productos");
    }

    const unavailable = dbProducts.filter((p) => p.status !== "available");
    if (unavailable.length > 0) {
      return {
        success: false,
        error: `Algunos productos ya no están disponibles: ${unavailable.map((u) => u.title).join(", ")}`,
      };
    }

    // Calculate totals securely with DB prices
    const itemsTotal = dbProducts.reduce((sum, p) => sum + Number(p.price), 0);
    const totalAmount = itemsTotal + SHIPPING_FEE;

    // 2. Create Order in DB
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId || null,
        customer_email: data.email,
        customer_name: data.fullName,
        shipping_fee: SHIPPING_FEE,
        total_amount: totalAmount,
        shipping_info: data, // JSONB
        status: "pending",
      })
      .select()
      .single();

    if (orderErr) {
      console.error("Error creating order:", orderErr);
      throw new Error(
        `No se pudo crear la orden en la base de datos. Detalle: ${orderErr.message || JSON.stringify(orderErr)}`,
      );
    }

    // 3. Create Order Items
    const orderItemsRecord = dbProducts.map((p) => ({
      order_id: order.id,
      product_id: p.id,
      price: p.price,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsRecord);

    if (itemsErr) {
      console.error("Error creating order items:", itemsErr);
      throw new Error("No se pudieron guardar los detalles de la orden");
    }

    // 4. Reserve all products in parallel (only if still available)
    // Expired reservations are released lazily via releaseExpiredReservations() above.
    const reservationResults = await Promise.all(
      dbProducts.map((p) =>
        supabase
          .from("products")
          .update({ status: "reserved", reserved_at: new Date().toISOString() })
          .eq("id", p.id)
          .eq("status", "available")
          .select("id")
          .single()
          .then((res) => ({ id: p.id, title: p.title, success: !!res.data, error: res.error })),
      ),
    );

    // Check if any failed — rollback all successful ones
    const failed = reservationResults.filter((r) => !r.success);
    if (failed.length > 0) {
      const successIds = reservationResults.filter((r) => r.success).map((r) => r.id);
      if (successIds.length > 0) {
        await supabase
          .from("products")
          .update({ status: "available", reserved_at: null })
          .in("id", successIds);
      }
      return {
        success: false,
        error: `Producto "${failed[0].title}" ya no está disponible`,
      };
    }

    // 5. Build MP Preference items
    const mpItems = dbProducts.map((p) => ({
      id: p.id,
      title: p.title,
      currency_id: "ARS",
      picture_url: "", // Realistically we'd pass image_urls[0] here if we fetched it
      category_id: "fashion",
      quantity: 1,
      unit_price: Number(p.price),
    }));

    // Add shipping as an item
    mpItems.push({
      id: "SHIPPING",
      title: "Envío Correo Argentino",
      currency_id: "ARS",
      picture_url: "",
      category_id: "shipping",
      quantity: 1,
      unit_price: Number(SHIPPING_FEE),
    });

    const preference = new Preference(mpClient);

    // Resolve payment URLs from environment
    const { webhookBaseUrl } = resolvePaymentUrls();

    const response = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: data.fullName.split(" ")[0],
          surname: data.fullName.split(" ").slice(1).join(" "),
          email: data.email,
        },
        back_urls: {
          success: `${webhookBaseUrl}/api/mp-return?status=success&order_id=${order.id}`,
          failure: `${webhookBaseUrl}/api/mp-return?status=failure&order_id=${order.id}`,
          pending: `${webhookBaseUrl}/api/mp-return?status=pending&order_id=${order.id}`,
        },
        auto_return: "approved",
        external_reference: order.id,
        notification_url: `${webhookBaseUrl}/api/webhooks/mp`,
        statement_descriptor: "CLUB VTG",
        binary_mode: true,
      },
    });

    // Save preference ID to order
    await supabase.from("orders").update({ mp_preference_id: response.id }).eq("id", order.id);

    return {
      success: true,
      initPoint: response.init_point, // For production use init_point. For sandbox use sandbox_init_point
      sandboxInitPoint: response.sandbox_init_point,
    };
  } catch (error: unknown) {
    console.error("Checkout action error:", error);
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : "Error procesando el checkout";
    return { success: false, error: message };
  }
}
