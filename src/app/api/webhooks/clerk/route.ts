// ── Clerk Webhook Handler ──
// Creates profiles in Supabase when users sign up via Clerk
// Assigns 2 credits when email is verified

import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[webhook] CLERK_WEBHOOK_SECRET not configured");
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  // Get svix headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error("[webhook] Missing svix headers");
    return new Response("Missing svix headers", { status: 400 });
  }

  // Verify webhook
  const payload = await req.json();
  const body = JSON.stringify(payload);
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err: unknown) {
    console.error("[webhook] Verification failed:", err);
    return new Response("Webhook verification failed", { status: 400 });
  }

  const eventType = evt.type;

  // ── user.created → Create profile with 0 credits ──
  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses?.[0]?.email_address;

    if (!email) {
      console.error("[webhook] No email found in event data");
      return new Response("No email found", { status: 400 });
    }

    const fullName = [first_name, last_name].filter(Boolean).join(" ") || null;

    const { error } = await supabaseAdmin.from("profiles").upsert(
      {
        id,
        email,
        full_name: fullName,
        credits: 0,
        is_admin: email === process.env.ADMIN_EMAIL,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("[webhook] ❌ Supabase upsert failed:", JSON.stringify(error));
      return new Response(`Failed to create profile: ${error.message}`, { status: 500 });
    }

  }

  // ── user.updated → Check email verification → assign 2 credits ──
  if (eventType === "user.updated") {
    const { id, email_addresses } = evt.data;
    const primaryEmail = email_addresses?.find(
      (e) => e.id === evt.data.primary_email_address_id,
    );

    if (primaryEmail?.verification?.status === "verified") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("credits")
        .eq("id", id)
        .single();

      if (profile && profile.credits === 0) {
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ credits: 2, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (!updateError) {
          await supabaseAdmin.from("credit_transactions").insert({
            user_id: id,
            amount: 2,
            reason: "registration_bonus",
          });

        } else {
          console.error("[webhook] ❌ Failed to assign credits:", updateError);
        }
      }
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
      const { data: uploads } = await supabaseAdmin.storage
        .from("user-uploads")
        .list(userId);
      if (uploads && uploads.length > 0) {
        const uploadPaths = uploads.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("user-uploads").remove(uploadPaths);
      }

      const { data: results } = await supabaseAdmin.storage
        .from("ai-results")
        .list(userId);
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

  return new Response("OK", { status: 200 });
}
