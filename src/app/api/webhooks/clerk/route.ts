// ── Clerk Webhook Handler ──
// Creates profiles in Supabase when users sign up via Clerk
// Assigns 2 credits when email is verified

import { type WebhookEvent, verifyWebhook } from "@clerk/nextjs/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { synchronizeClerkUser } from "./lifecycle";

export async function POST(request: Request) {
  const signingSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!signingSecret) {
    console.error("[webhook] CLERK_WEBHOOK_SECRET not configured");
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  let evt: WebhookEvent;

  try {
    evt = await verifyWebhook(request as Parameters<typeof verifyWebhook>[0], { signingSecret });
  } catch {
    console.error("[webhook] Clerk verification failed");
    return new Response("Webhook verification failed", { status: 400 });
  }

  const eventType = evt.type;

  if (evt.type === "user.created" || evt.type === "user.updated") {
    try {
      await synchronizeClerkUser(evt);
    } catch {
      console.error("[webhook] Clerk lifecycle synchronization failed", { eventType });
      return new Response("Clerk lifecycle synchronization failed", { status: 500 });
    }
  }

  // ── user.deleted → Clean up all user data ──
  if (eventType === "user.deleted") {
    const userId = evt.data.id;

    if (!userId) {
      console.error("[webhook] user.deleted — no user ID in event data");
      return new Response("No user ID", { status: 400 });
    }

    try {
      // Delete AI try-on logs
      await supabaseAdmin.from("ai_tryon_logs").delete().eq("user_id", userId);

      // Delete credit transactions
      await supabaseAdmin.from("credit_transactions").delete().eq("user_id", userId);

      // Delete orders (order_items first due to FK constraint)
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("user_id", userId);

      if (orders && orders.length > 0) {
        const orderIds = orders.map((o) => o.id);
        await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
        await supabaseAdmin.from("orders").delete().eq("user_id", userId);
      }

      // Delete uploaded images from storage
      const { data: uploads } = await supabaseAdmin.storage.from("user-uploads").list(userId);
      if (uploads && uploads.length > 0) {
        const uploadPaths = uploads.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("user-uploads").remove(uploadPaths);
      }

      const { data: results } = await supabaseAdmin.storage.from("ai-results").list(userId);
      if (results && results.length > 0) {
        const resultPaths = results.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("ai-results").remove(resultPaths);
      }

      // Delete profile last
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
    } catch (err) {
      console.error(`[webhook] ❌ Failed to clean up user ${userId}:`, err);
      return new Response("Failed to delete user data", { status: 500 });
    }
  }

  if (eventType !== "user.created" && eventType !== "user.updated" && eventType !== "user.deleted") {
    console.info("[webhook] Unsupported Clerk event", { eventType });
  }

  return new Response("OK", { status: 200 });
}
