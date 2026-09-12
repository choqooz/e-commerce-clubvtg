alter table public.orders
  alter column id set default pg_catalog.gen_random_uuid();

alter table public.order_items
  alter column id set default pg_catalog.gen_random_uuid();

do $cleanup$
declare
  compatibility_function oid := to_regprocedure('public.uuid_generate_v4()');
begin
  if compatibility_function is not null
    and obj_description(compatibility_function, 'pg_proc') = 'e-commerce-clubvtg temporary UUID compatibility wrapper'
    and not exists (
      select 1
      from pg_catalog.pg_depend dependency
      where dependency.classid = 'pg_catalog.pg_proc'::regclass
        and dependency.objid = compatibility_function
        and dependency.refclassid = 'pg_catalog.pg_extension'::regclass
        and dependency.deptype = 'e'
    ) then
    drop function public.uuid_generate_v4();
  end if;
end;
$cleanup$;
