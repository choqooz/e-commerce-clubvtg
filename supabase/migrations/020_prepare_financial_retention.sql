-- Prepare retained financial records for irreversible Clerk identity anonymization.
begin;

alter table public.orders
  alter column user_id drop not null,
  alter column customer_email drop not null,
  alter column customer_name drop not null,
  add column if not exists clerk_anonymized_at timestamptz;

alter table public.orders
  drop constraint if exists orders_integrity_v1_authority_check,
  add constraint orders_integrity_v1_authority_check check (
    integrity_version = 0 or (
      integrity_version = 1
      and payment_amount is not null and payment_amount >= 0 and payment_currency = 'ARS'
      and nullif(pg_catalog.btrim(payment_reference), '') is not null and payment_expires_at is not null
      and (
        (user_id is not null and purchase_user_id = user_id)
        or (clerk_anonymized_at is not null and user_id is null and purchase_user_id is null
          and customer_email is null and customer_name is null and shipping_info is null and tracking_number is null)
      )
    )
  );

alter table public.credit_transactions
  drop constraint if exists credit_transactions_user_id_fkey,
  alter column user_id drop not null,
  add column if not exists clerk_anonymized_at timestamptz,
  add constraint credit_transactions_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete set null;

alter table public.credit_purchase_intents
  drop constraint if exists credit_purchase_intents_user_id_fkey,
  alter column user_id drop not null,
  add column if not exists clerk_anonymized_at timestamptz,
  add constraint credit_purchase_intents_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete set null;

create or replace function public.update_orders_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.clerk_anonymized_at is null and new.clerk_anonymized_at is not null then
    new.updated_at := old.updated_at;
  else
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_order_checkout_authority_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.integrity_version = 1 and (new.user_id, new.purchase_user_id, new.total_amount, new.shipping_fee, new.shipping_info, new.payment_amount, new.payment_currency, new.payment_reference, new.payment_expires_at) is distinct from (old.user_id, old.purchase_user_id, old.total_amount, old.shipping_fee, old.shipping_info, old.payment_amount, old.payment_currency, old.payment_reference, old.payment_expires_at)
    and not (old.clerk_anonymized_at is null and new.clerk_anonymized_at is not null
      and new.user_id is null and new.purchase_user_id is null and new.shipping_info is null
      and (new.total_amount, new.shipping_fee, new.payment_amount, new.payment_currency, new.payment_reference, new.payment_expires_at) is not distinct from (old.total_amount, old.shipping_fee, old.payment_amount, old.payment_currency, old.payment_reference, old.payment_expires_at)) then
    raise exception using errcode = 'P0001', message = 'immutable_product_checkout_authority';
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_credit_purchase_intent_authority_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (new.user_id, new.pack_id, new.amount, new.currency, new.credits, new.reference, new.expires_at) is distinct from (old.user_id, old.pack_id, old.amount, old.currency, old.credits, old.reference, old.expires_at)
    and not (old.clerk_anonymized_at is null and new.clerk_anonymized_at is not null and new.user_id is null
      and (new.pack_id, new.amount, new.currency, new.credits, new.reference, new.expires_at) is not distinct from (old.pack_id, old.amount, old.currency, old.credits, old.reference, old.expires_at)) then
    raise exception using errcode = 'P0001', message = 'immutable_credit_purchase_authority';
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_clerk_financial_anonymization()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old jsonb := pg_catalog.to_jsonb(old);
  v_new jsonb := pg_catalog.to_jsonb(new);
  v_old_facts jsonb;
  v_new_facts jsonb;
  v_pii_column text;
begin
  if (v_old -> 'clerk_anonymized_at') = 'null'::jsonb
     and (v_new -> 'clerk_anonymized_at') = 'null'::jsonb then
    foreach v_pii_column in array tg_argv loop
      if (v_old -> v_pii_column) is distinct from 'null'::jsonb
         and (v_new -> v_pii_column) = 'null'::jsonb then
        raise exception using errcode = 'P0001', message = 'clerk_financial_anonymization_marker_required';
      end if;
    end loop;
  end if;

  if (v_new -> 'clerk_anonymized_at') is distinct from 'null'::jsonb then
    foreach v_pii_column in array tg_argv loop
      if (v_new -> v_pii_column) is distinct from 'null'::jsonb then
        raise exception using errcode = 'P0001', message = 'clerk_financial_pii_rehydration';
      end if;
    end loop;
  end if;

  if (v_old -> 'clerk_anonymized_at') is distinct from 'null'::jsonb
     and (v_new -> 'clerk_anonymized_at') is distinct from (v_old -> 'clerk_anonymized_at') then
    raise exception using errcode = 'P0001', message = 'clerk_financial_anonymization_irreversible';
  end if;

  v_old_facts := v_old - tg_argv - 'clerk_anonymized_at';
  v_new_facts := v_new - tg_argv - 'clerk_anonymized_at';
  if (v_new -> 'clerk_anonymized_at') is distinct from 'null'::jsonb
     and v_new_facts is distinct from v_old_facts then
    raise exception using errcode = 'P0001', message = 'retained_financial_fact_mutation';
  end if;

  return new;
end;
$function$;

drop trigger if exists orders_clerk_financial_anonymization on public.orders;
create trigger orders_clerk_financial_anonymization
before update on public.orders
for each row execute function public.enforce_clerk_financial_anonymization(
  'user_id', 'purchase_user_id', 'customer_email', 'customer_name', 'shipping_info', 'tracking_number'
);

drop trigger if exists credit_transactions_clerk_financial_anonymization on public.credit_transactions;
create trigger credit_transactions_clerk_financial_anonymization
before update on public.credit_transactions
for each row execute function public.enforce_clerk_financial_anonymization('user_id');

drop trigger if exists credit_purchase_intents_clerk_financial_anonymization on public.credit_purchase_intents;
create trigger credit_purchase_intents_clerk_financial_anonymization
before update on public.credit_purchase_intents
for each row execute function public.enforce_clerk_financial_anonymization('user_id');

revoke execute on function public.enforce_clerk_financial_anonymization()
  from public, anon, authenticated, service_role;

commit;
