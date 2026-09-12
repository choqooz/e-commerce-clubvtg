do $compatibility$
begin
  if to_regprocedure('public.uuid_generate_v4()') is null then
    create function public.uuid_generate_v4()
    returns uuid
    language sql
    volatile
    security invoker
    as $function$
      select pg_catalog.gen_random_uuid();
    $function$;

    comment on function public.uuid_generate_v4()
      is 'e-commerce-clubvtg temporary UUID compatibility wrapper';
  end if;
end;
$compatibility$;
