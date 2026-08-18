-- Additive authority fields and replay identity foundations; callers remain unchanged.
begin;
lock table public.orders, public.order_items, public.products in share row exclusive mode;

alter table public.orders add column if not exists integrity_version smallint not null default 0;
alter table public.orders add column if not exists purchase_user_id text;
alter table public.orders add column if not exists payment_amount numeric;
alter table public.orders add column if not exists payment_currency text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_expires_at timestamptz;
alter table public.orders drop constraint if exists orders_integrity_v1_authority_check;
alter table public.orders add constraint orders_integrity_v1_authority_check check (
  integrity_version = 0 or (integrity_version = 1 and user_id is not null and purchase_user_id = user_id
    and payment_amount is not null and payment_amount >= 0 and payment_currency = 'ARS'
    and nullif(pg_catalog.btrim(payment_reference), '') is not null and payment_expires_at is not null)
);
alter table public.order_items add column if not exists integrity_version smallint not null default 0;
alter table public.order_items add column if not exists product_title_snapshot text;
alter table public.order_items drop constraint if exists order_items_integrity_version_check;
alter table public.order_items add constraint order_items_integrity_version_check check (
  integrity_version = 0 or (integrity_version = 1 and product_id is not null and price >= 0)
);

create table if not exists public.payment_claims (
  provider text not null,
  payment_id text not null,
  claim_state text not null check (claim_state in ('active', 'blocked')),
  subject_kind text,
  subject_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (provider, payment_id),
  check (nullif(pg_catalog.btrim(provider), '') is not null and nullif(pg_catalog.btrim(payment_id), '') is not null),
  check ((claim_state = 'active' and subject_kind is not null and subject_id is not null) or (claim_state = 'blocked' and subject_kind is null and subject_id is null))
);
create table if not exists public.payment_events (
  provider text not null,
  event_key text not null,
  payment_id text,
  received_at timestamptz not null default pg_catalog.now(),
  primary key (provider, event_key),
  check (nullif(pg_catalog.btrim(provider), '') is not null and nullif(pg_catalog.btrim(event_key), '') is not null)
);
create table if not exists public.payment_manual_reviews (
  id bigint generated always as identity primary key,
  provider text not null,
  payment_id text not null,
  review_kind text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  unique (provider, payment_id, review_kind)
);
alter table public.payment_claims enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_manual_reviews enable row level security;

insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id)
select 'mercadopago', orders.mp_payment_id, 'active', 'order', orders.id
from public.orders as orders
join (select mp_payment_id from public.orders where nullif(pg_catalog.btrim(mp_payment_id), '') is not null group by mp_payment_id having count(*) = 1) unique_ids
  on unique_ids.mp_payment_id = orders.mp_payment_id
on conflict do nothing;
insert into public.payment_claims (provider, payment_id, claim_state)
select 'mercadopago', mp_payment_id, 'blocked'
from public.orders where nullif(pg_catalog.btrim(mp_payment_id), '') is not null
group by mp_payment_id having count(*) > 1
on conflict do nothing;
insert into public.integrity_quarantine (source_table, source_id, reason, evidence)
select 'payment_claims', 'mercadopago:' || mp_payment_id, 'duplicate_payment_id_blocked', pg_catalog.jsonb_build_object('count', count(*))
from public.orders where nullif(pg_catalog.btrim(mp_payment_id), '') is not null
group by mp_payment_id having count(*) > 1
on conflict do nothing;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'orders', id::text, 'legacy_pending_cancelled', pg_catalog.jsonb_build_object('payment_id', mp_payment_id)
from public.orders where status = 'pending' and integrity_version = 0
on conflict do nothing;
update public.orders set status = 'cancelled', updated_at = pg_catalog.now()
where status = 'pending' and integrity_version = 0;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'products', id::text, 'legacy_reservation_released', pg_catalog.jsonb_build_object('reserved_at', reserved_at)
from public.products where status = 'reserved'
on conflict do nothing;
update public.products set status = 'available', reserved_at = null where status = 'reserved';
commit;
