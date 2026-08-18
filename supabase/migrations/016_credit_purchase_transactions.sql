-- Immutable credit-purchase authority and atomic settlement; callers activate only after rollout.
begin;
create table public.credit_purchase_intents (
  id uuid primary key default pg_catalog.gen_random_uuid(), user_id text not null references public.profiles(id), pack_id text not null check (pack_id in ('basic', 'popular', 'pro')),
  amount numeric not null check (amount > 0), currency text not null check (currency = 'ARS'), credits integer not null check (credits > 0),
  reference text not null unique check (nullif(pg_catalog.btrim(reference), '') is not null), expires_at timestamptz not null, preference_id text unique,
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')), mp_payment_id text, cancelled_reason text, created_at timestamptz not null default pg_catalog.now(), applied_at timestamptz
);
alter table public.credit_purchase_intents enable row level security;

create function public.prevent_credit_purchase_intent_authority_mutation() returns trigger language plpgsql set search_path = '' as $function$
begin
  if (new.user_id, new.pack_id, new.amount, new.currency, new.credits, new.reference, new.expires_at) is distinct from (old.user_id, old.pack_id, old.amount, old.currency, old.credits, old.reference, old.expires_at) then raise exception using errcode = 'P0001', message = 'immutable_credit_purchase_authority'; end if;
  return new;
end $function$;
create trigger credit_purchase_intent_authority_immutable before update on public.credit_purchase_intents for each row execute function public.prevent_credit_purchase_intent_authority_mutation();

create function public.create_credit_purchase_intent(p_user_id text, p_pack_id text, p_amount numeric, p_reference text, p_credits integer)
returns table(id uuid, reference text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $function$
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) !~ '^user_[A-Za-z0-9_]+$' or p_pack_id not in ('basic', 'popular', 'pro') or p_amount is null or p_amount <= 0 or p_credits is null or p_credits <= 0 or p_reference is null or pg_catalog.btrim(p_reference) = '' then raise exception using errcode = 'P0001', message = 'invalid_credit_purchase_intent'; end if;
  perform 1 from public.profiles as profiles where profiles.id = p_user_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'user_profile_not_found'; end if;
  insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
  values (p_user_id, p_pack_id, p_amount, 'ARS', p_credits, p_reference, pg_catalog.now() + pg_catalog.make_interval(mins => 15)) returning credit_purchase_intents.id, credit_purchase_intents.reference, credit_purchase_intents.expires_at into id, reference, expires_at;
  return next;
end $function$;

create function public.attach_credit_preference(p_intent_id uuid, p_preference_id text, p_expires_at timestamptz) returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  update public.credit_purchase_intents set preference_id = p_preference_id where id = p_intent_id and status = 'pending' and preference_id is null and expires_at = p_expires_at and expires_at > pg_catalog.now() and p_preference_id is not null and pg_catalog.btrim(p_preference_id) <> '';
  return found;
end $function$;

create function public.cancel_credit_purchase_intent(p_intent_id uuid, p_reason text) returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  update public.credit_purchase_intents set status = 'cancelled', cancelled_reason = nullif(pg_catalog.btrim(p_reason), '') where id = p_intent_id and status = 'pending';
  return found;
end $function$;

create function public.settle_credit_payment(p_provider text, p_payment_id text, p_reference text, p_user_id text, p_amount numeric, p_currency text)
returns table(intent_id uuid, newly_applied boolean, result text) language plpgsql security definer set search_path = '' as $function$
declare v_intent public.credit_purchase_intents%rowtype; v_claim_subject uuid;
begin
  newly_applied := false;
  if p_provider <> 'mercadopago' or p_payment_id is null or pg_catalog.btrim(p_payment_id) = '' or p_reference is null or p_user_id is null or p_amount is null or p_currency <> 'ARS' then result := 'invalid_payment'; return next; return; end if;
  select claims.subject_id into strict v_claim_subject from public.payment_claims as claims where claims.provider = p_provider and claims.payment_id = p_payment_id for update;
  if found then intent_id := v_claim_subject; result := 'duplicate_payment'; return next; return; end if;
exception when no_data_found then
  select intents.* into v_intent from public.credit_purchase_intents as intents where intents.reference = p_reference for update;
  if not found then result := 'unknown_intent'; return next; return; end if;
  intent_id := v_intent.id;
  select claims.subject_id into v_claim_subject from public.payment_claims as claims where claims.provider = p_provider and claims.payment_id = p_payment_id;
  if found then result := 'duplicate_payment'; return next; return; end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= pg_catalog.now() or v_intent.user_id <> p_user_id or v_intent.amount <> p_amount or v_intent.currency <> p_currency then result := 'intent_mismatch'; return next; return; end if;
  begin insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id) values (p_provider, p_payment_id, 'active', 'credit_intent', v_intent.id);
  exception when unique_violation then result := 'duplicate_payment'; return next; return; end;
  perform 1 from public.profiles as profiles where profiles.id = v_intent.user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'user_profile_not_found'; end if;
  update public.profiles set credits = credits + v_intent.credits, updated_at = pg_catalog.now() where id = v_intent.user_id;
  insert into public.credit_transactions (user_id, amount, reason, mp_payment_id) values (v_intent.user_id, v_intent.credits, 'mp_credit_settlement', p_payment_id);
  update public.credit_purchase_intents set status = 'applied', mp_payment_id = p_payment_id, applied_at = pg_catalog.now() where id = v_intent.id;
  newly_applied := true; result := 'applied'; return next;
end $function$;

revoke execute on function public.create_credit_purchase_intent(text, text, numeric, text, integer), public.attach_credit_preference(uuid, text, timestamptz), public.cancel_credit_purchase_intent(uuid, text), public.settle_credit_payment(text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.create_credit_purchase_intent(text, text, numeric, text, integer), public.attach_credit_preference(uuid, text, timestamptz), public.cancel_credit_purchase_intent(uuid, text), public.settle_credit_payment(text, text, text, text, numeric, text) to service_role, postgres;
commit;
