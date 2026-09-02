begin;

alter table public.coupon_audit_events drop constraint coupon_audit_events_action_check;
alter table public.coupon_audit_events add constraint coupon_audit_events_action_check check (action in ('created', 'replaced', 'replacement_created', 'deactivated'));

create function public.deactivate_coupon(p_actor text, p_coupon_id uuid, p_reason text) returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_coupon_id uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if pg_catalog.btrim(coalesce(p_actor, '')) = '' or v_reason = '' or pg_catalog.length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'coupon_deactivation_reason_invalid';
  end if;

  select definitions.id into v_coupon_id from public.coupon_definitions definitions where definitions.id = p_coupon_id and definitions.is_active for update;
  if not found then return false; end if;

  update public.coupon_definitions set is_active = false, deactivated_at = pg_catalog.statement_timestamp(), deactivation_reason = v_reason where id = v_coupon_id;
  insert into public.coupon_audit_events (coupon_id, actor, action, reason) values (v_coupon_id, p_actor, 'deactivated', v_reason);
  return true;
end;
$function$;

revoke execute on function public.deactivate_coupon(text, uuid, text) from public, anon, authenticated;
grant execute on function public.deactivate_coupon(text, uuid, text) to service_role, postgres;
commit;
