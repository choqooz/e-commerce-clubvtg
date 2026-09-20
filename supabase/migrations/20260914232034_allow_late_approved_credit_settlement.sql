begin;

create or replace function public.settle_credit_payment(p_provider text, p_payment_id text, p_reference text, p_user_id text, p_amount numeric, p_currency text)
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
  if v_intent.status <> 'pending' or v_intent.user_id is null or v_intent.user_id <> p_user_id or v_intent.amount <> p_amount or v_intent.currency <> p_currency then result := 'intent_mismatch'; return next; return; end if;
  begin insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id) values (p_provider, p_payment_id, 'active', 'credit_intent', v_intent.id);
  exception when unique_violation then result := 'duplicate_payment'; return next; return; end;
  perform 1 from public.profiles as profiles where profiles.id = v_intent.user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'user_profile_not_found'; end if;
  update public.profiles set credits = credits + v_intent.credits, updated_at = pg_catalog.now() where id = v_intent.user_id;
  insert into public.credit_transactions (user_id, amount, reason, mp_payment_id) values (v_intent.user_id, v_intent.credits, 'mp_credit_settlement', p_payment_id);
  update public.credit_purchase_intents set status = 'applied', mp_payment_id = p_payment_id, applied_at = pg_catalog.now() where id = v_intent.id;
  newly_applied := true; result := 'applied'; return next;
end $function$;

revoke execute on function public.settle_credit_payment(text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.settle_credit_payment(text, text, text, text, numeric, text) to service_role, postgres;

commit;
