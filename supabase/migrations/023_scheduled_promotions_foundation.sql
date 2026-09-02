begin;

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index product_types_name_ci_key on public.product_types (lower(name));

create table public.product_subtypes (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.product_types(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, product_type_id)
);

create unique index product_subtypes_type_name_ci_key
  on public.product_subtypes (product_type_id, lower(name));

alter table public.products
  add column product_type_id uuid,
  add column product_subtype_id uuid,
  add constraint products_taxonomy_pair_check check (
    product_subtype_id is null or product_type_id is not null
  ),
  add constraint products_taxonomy_pair_fkey foreign key (product_subtype_id, product_type_id)
    references public.product_subtypes(id, product_type_id) on delete restrict;

insert into public.product_types (name)
select min(btrim(category))
from public.products
where btrim(coalesce(category, '')) <> ''
group by lower(btrim(category))
on conflict (lower(name)) do nothing;

insert into public.product_subtypes (product_type_id, name)
select types.id, min(btrim(products.subcategory))
from public.products
join public.product_types as types on lower(types.name) = lower(btrim(products.category))
where btrim(coalesce(products.subcategory, '')) <> ''
group by types.id, lower(btrim(products.subcategory))
on conflict (product_type_id, lower(name)) do nothing;

update public.products as products
set product_type_id = mappings.type_id,
    product_subtype_id = mappings.subtype_id
from (
  select legacy.id, types.id as type_id, subtypes.id as subtype_id
  from public.products as legacy
  join public.product_types as types on lower(types.name) = lower(btrim(legacy.category))
  left join public.product_subtypes as subtypes
    on subtypes.product_type_id = types.id
   and lower(subtypes.name) = lower(btrim(legacy.subcategory))
) as mappings
where products.id = mappings.id;

create index products_taxonomy_pair_idx on public.products (product_type_id, product_subtype_id);

alter table public.product_types enable row level security;
alter table public.product_subtypes enable row level security;
revoke all on public.product_types, public.product_subtypes from anon, authenticated;

create function public.create_product_taxonomy_type(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  insert into public.product_types (name) values (btrim(p_name)) returning id into v_id;
  return v_id;
end;
$function$;

create function public.create_product_taxonomy_subtype(p_type_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  insert into public.product_subtypes (product_type_id, name) values (p_type_id, btrim(p_name)) returning id into v_id;
  return v_id;
end;
$function$;

create function public.set_product_taxonomy_active(
  p_kind text,
  p_id uuid,
  p_is_active boolean
) returns void
language plpgsql security definer set search_path = '' as $function$
begin
  if p_kind = 'type' then
    update public.product_types set is_active = p_is_active where id = p_id;
  elsif p_kind = 'subtype' then
    update public.product_subtypes set is_active = p_is_active where id = p_id;
  else
    raise exception using errcode = 'P0001', message = 'invalid_taxonomy_kind';
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'taxonomy_not_found'; end if;
end;
$function$;

revoke execute on function public.create_product_taxonomy_type(text), public.create_product_taxonomy_subtype(uuid, text), public.set_product_taxonomy_active(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_product_taxonomy_type(text), public.create_product_taxonomy_subtype(uuid, text) to service_role, postgres;
grant execute on function public.set_product_taxonomy_active(text, uuid, boolean) to service_role, postgres;

commit;
