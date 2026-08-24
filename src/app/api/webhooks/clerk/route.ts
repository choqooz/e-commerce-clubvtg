// ── Clerk Webhook Handler ──
// Creates profiles in Supabase when users sign up via Clerk
// Assigns 2 credits when email is verified

import { type WebhookEvent, verifyWebhook } from "@clerk/nextjs/webhooks";
import { deleteClerkUser, synchronizeClerkUser } from "./lifecycle";

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

  // ── user.deleted → checked Storage cleanup before database-owned anonymization ──
  if (eventType === "user.deleted") {
    try {
      await deleteClerkUser(evt);
    } catch {
      console.error("[webhook] Clerk lifecycle deletion failed", { eventType });
      return new Response("Failed to delete user data", { status: 500 });
    }
  }

  if (eventType !== "user.created" && eventType !== "user.updated" && eventType !== "user.deleted") {
    console.info("[webhook] Unsupported Clerk event", { eventType });
  }

  return new Response("OK", { status: 200 });
}
