-- Snapshot legacy payment and inventory ambiguity without assigning ownership.

create table if not exists public.integrity_audit (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_id text not null,
  finding text not null,
  evidence jsonb not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (source_table, source_id, finding)
);
create table if not exists public.integrity_quarantine (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_id text not null,
  reason text not null,
  evidence jsonb not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (source_table, source_id, reason)
);
alter table public.integrity_audit enable row level security;
alter table public.integrity_quarantine enable row level security;

insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'orders', orders.id::text, 'duplicate_payment_id', pg_catalog.jsonb_build_object('payment_id', orders.mp_payment_id)
from public.orders
join (select mp_payment_id from public.orders where nullif(pg_catalog.btrim(mp_payment_id), '') is not null group by mp_payment_id having count(*) > 1) duplicates
  on duplicates.mp_payment_id = orders.mp_payment_id
on conflict do nothing;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'orders', id::text, 'anonymous_or_null_user', pg_catalog.jsonb_build_object('status', status, 'payment_id', mp_payment_id)
from public.orders where nullif(pg_catalog.btrim(user_id), '') is null
on conflict do nothing;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'order_items', items.id::text, 'null_product_id', pg_catalog.jsonb_build_object('order_id', items.order_id)
from public.order_items as items where items.product_id is null
on conflict do nothing;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'order_items', items.id::text, 'duplicate_product_item', pg_catalog.jsonb_build_object('product_id', items.product_id)
from public.order_items as items
join (select product_id from public.order_items where product_id is not null group by product_id having count(*) > 1) duplicates on duplicates.product_id = items.product_id
on conflict do nothing;
insert into public.integrity_audit (source_table, source_id, finding, evidence)
select 'products', id::text, 'unowned_legacy_reservation', pg_catalog.jsonb_build_object('reserved_at', reserved_at)
from public.products where status = 'reserved'
on conflict do nothing;

insert into public.integrity_quarantine (source_table, source_id, reason, evidence)
select source_table, source_id, finding, evidence from public.integrity_audit
on conflict do nothing;
