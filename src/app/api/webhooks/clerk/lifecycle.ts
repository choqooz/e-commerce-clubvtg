import type { UserWebhookEvent } from "@clerk/nextjs/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BONUS_RESULT = {
  ALREADY_GRANTED: "already_granted",
  GRANTED: "granted",
  INACTIVE: "inactive",
  INELIGIBLE: "ineligible",
} as const;

const ANONYMIZATION_RESULT = {
  ALREADY_ANONYMIZED: "already_anonymized",
  ANONYMIZED: "anonymized",
} as const;

const USER_STORAGE_BUCKETS = ["user-uploads", "ai-results"] as const;
const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

type BonusResult = (typeof BONUS_RESULT)[keyof typeof BONUS_RESULT];
type AnonymizationResult = (typeof ANONYMIZATION_RESULT)[keyof typeof ANONYMIZATION_RESULT];
type SynchronizationEvent = Exclude<UserWebhookEvent, { type: "user.deleted" }>;
type DeletionEvent = Extract<UserWebhookEvent, { type: "user.deleted" }>;

interface ProfileIdentity {
  email: string;
  fullName: string | null;
}

function resolvePrimaryIdentity(event: SynchronizationEvent): ProfileIdentity {
  const primaryEmailId = event.data.primary_email_address_id;
  if (!primaryEmailId) throw new Error("missing_primary_email_id");

  const matches = event.data.email_addresses.filter((email) => email.id === primaryEmailId);
  if (matches.length !== 1) throw new Error("ambiguous_primary_email");

  const email = matches[0].email_address.trim().toLowerCase();
  if (!email) throw new Error("missing_primary_email_address");

  const fullName = [event.data.first_name, event.data.last_name].filter(Boolean).join(" ").trim() || null;
  return { email, fullName };
}

function isBonusResult(value: unknown): value is BonusResult {
  return typeof value === "string" && Object.values(BONUS_RESULT).includes(value as BonusResult);
}

function isAnonymizationResult(value: unknown): value is AnonymizationResult {
  return typeof value === "string" && Object.values(ANONYMIZATION_RESULT).includes(value as AnonymizationResult);
}

function storagePath(prefix: string, object: { key?: string; name: string }) {
  const path = object.key ?? `${prefix}${object.name}`;
  if (!path.startsWith(prefix)) throw new Error("storage_path_outside_user_scope");
  return path;
}

async function listStoragePaths(bucket: (typeof USER_STORAGE_BUCKETS)[number], prefix: string) {
  const storage = supabaseAdmin.storage.from(bucket);
  const paths: string[] = [];
  let cursor: string | undefined;

  do {
    const { data, error } = await storage.listV2({ cursor, limit: STORAGE_PAGE_SIZE, prefix });
    if (error || !data) throw new Error("storage_list_failed");
    paths.push(...data.objects.map((object) => storagePath(prefix, object)));
    if (data.hasNext && !data.nextCursor) throw new Error("storage_cursor_missing");
    cursor = data.hasNext ? data.nextCursor : undefined;
  } while (cursor);

  return { paths, storage };
}

async function removeUserStorage(bucket: (typeof USER_STORAGE_BUCKETS)[number], prefix: string) {
  const { paths, storage } = await listStoragePaths(bucket, prefix);
  for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const { error } = await storage.remove(paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE));
    if (error) throw new Error("storage_remove_failed");
  }

  if ((await listStoragePaths(bucket, prefix)).paths.length > 0) throw new Error("storage_cleanup_incomplete");
}

export async function synchronizeClerkUser(event: SynchronizationEvent) {
  const identity = resolvePrimaryIdentity(event);
  const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(
    { email: identity.email, full_name: identity.fullName, id: event.data.id },
    { onConflict: "id" },
  );

  if (upsertError) throw new Error("profile_sync_failed");

  const { data, error: bonusError } = await supabaseAdmin.rpc("apply_clerk_registration_bonus", {
    p_event_time: new Date(event.data.created_at).toISOString(),
    p_user_id: event.data.id,
  });
  if (bonusError || !isBonusResult(data)) throw new Error("registration_bonus_failed");
}

export async function deleteClerkUser(event: DeletionEvent) {
  const userId = event.data.id;
  if (typeof userId !== "string" || !/^user_[A-Za-z0-9_]+$/.test(userId)) {
    throw new Error("invalid_deleted_user_id");
  }

  const prefix = `${userId}/`;
  for (const bucket of USER_STORAGE_BUCKETS) await removeUserStorage(bucket, prefix);

  const { data, error } = await supabaseAdmin.rpc("anonymize_clerk_user", { p_user_id: userId });
  if (error || !isAnonymizationResult(data)) throw new Error("clerk_anonymization_failed");
}
