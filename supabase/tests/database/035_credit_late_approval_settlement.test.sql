-- Run against a fresh disposable PostgreSQL database after the late-approved settlement migration.
do $guard$
begin
  if current_setting('app.disposable_test', true) is distinct from 'true' then
    raise exception 'disposable_database_guard_required';
  end if;
end;
$guard$;

begin;

create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'P0001', message = p_case;
  end if;
end;
$assert$;

create function pg_temp.assert_settlement_execute_denied(p_role name) returns void language plpgsql as $denied$
begin
  execute format('set local role %I', p_role);
  begin
    perform * from public.settle_credit_payment('mercadopago', 'pay-035-denied', 'credits:035-denied', 'user_035_owner', 1500, 'ARS');
    raise exception using errcode = 'P0001', message = format('%s_can_execute_settlement', p_role);
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end;
$denied$;

insert into public.profiles (id, email, credits) values
  ('user_035_owner', '035-owner@example.invalid', 0),
  ('user_035_other', '035-other@example.invalid', 0),
  ('user_035_reused', '035-reused@example.invalid', 0);

insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
values ('user_035_owner', 'basic', 1500, 'ARS', 3, 'credits:035-expired', pg_catalog.now() - pg_catalog.make_interval(mins => 1));

create temp table expired_result as
select * from public.settle_credit_payment('mercadopago', 'pay-035-expired', 'credits:035-expired', 'user_035_owner', 1500, 'ARS');

select pg_temp.assert_true(
  (select newly_applied and result = 'applied' from expired_result)
    and (select credits = 3 from public.profiles where id = 'user_035_owner')
    and exists (select 1 from public.credit_transactions where user_id = 'user_035_owner' and amount = 3 and reason = 'mp_credit_settlement' and mp_payment_id = 'pay-035-expired')
    and exists (select 1 from public.payment_claims where provider = 'mercadopago' and payment_id = 'pay-035-expired' and subject_kind = 'credit_intent')
    and exists (select 1 from public.credit_purchase_intents where reference = 'credits:035-expired' and status = 'applied' and mp_payment_id = 'pay-035-expired' and applied_at is not null),
  'expired_valid_intent_not_applied'
);

select pg_temp.assert_true(
  not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-expired', 'credits:035-expired', 'user_035_owner', 1500, 'ARS'))
    and (select credits = 3 from public.profiles where id = 'user_035_owner')
    and (select count(*) = 1 from public.credit_transactions where mp_payment_id = 'pay-035-expired'),
  'expired_replay_not_idempotent'
);

insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
values ('user_035_other', 'basic', 1500, 'ARS', 3, 'credits:035-safety', pg_catalog.now() + pg_catalog.make_interval(mins => 1));

select pg_temp.assert_true(
  not (select newly_applied from public.settle_credit_payment('other', 'pay-035-wrong-provider', 'credits:035-safety', 'user_035_other', 1500, 'ARS'))
    and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-wrong-amount', 'credits:035-safety', 'user_035_other', 1499, 'ARS'))
    and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-wrong-currency', 'credits:035-safety', 'user_035_other', 1500, 'USD'))
    and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-wrong-user', 'credits:035-safety', 'user_035_owner', 1500, 'ARS'))
    and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-wrong-reference', 'credits:035-missing', 'user_035_other', 1500, 'ARS'))
    and (select credits = 0 from public.profiles where id = 'user_035_other')
    and exists (select 1 from public.credit_purchase_intents where reference = 'credits:035-safety' and status = 'pending')
    and not exists (select 1 from public.payment_claims where payment_id in ('pay-035-wrong-provider', 'pay-035-wrong-amount', 'pay-035-wrong-currency', 'pay-035-wrong-user', 'pay-035-wrong-reference')),
  'exact_payment_facts_not_enforced'
);

insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at, status)
values ('user_035_other', 'basic', 1500, 'ARS', 3, 'credits:035-cancelled', pg_catalog.now() - pg_catalog.make_interval(mins => 1), 'cancelled');

select pg_temp.assert_true(
  not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-cancelled', 'credits:035-cancelled', 'user_035_other', 1500, 'ARS'))
    and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-applied-again', 'credits:035-expired', 'user_035_owner', 1500, 'ARS'))
    and not exists (select 1 from public.payment_claims where payment_id in ('pay-035-cancelled', 'pay-035-applied-again')),
  'cancelled_or_applied_intent_settled'
);

alter table public.credit_purchase_intents alter column user_id drop not null;
insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
values (null, 'basic', 1500, 'ARS', 3, 'credits:035-null-owner', pg_catalog.now() - pg_catalog.make_interval(mins => 1));

select pg_temp.assert_true(
  not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-null-owner', 'credits:035-null-owner', 'user_035_owner', 1500, 'ARS'))
    and exists (select 1 from public.credit_purchase_intents where reference = 'credits:035-null-owner' and status = 'pending')
    and not exists (select 1 from public.payment_claims where payment_id = 'pay-035-null-owner')
    and not exists (select 1 from public.credit_transactions where mp_payment_id = 'pay-035-null-owner'),
  'null_owner_intent_not_failed_closed'
);

alter table public.credit_purchase_intents drop constraint credit_purchase_intents_user_id_fkey;
insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
values ('user_035_missing', 'basic', 1500, 'ARS', 3, 'credits:035-missing-profile', pg_catalog.now() - pg_catalog.make_interval(mins => 1));

do $profile_missing$
begin
  begin
    perform * from public.settle_credit_payment('mercadopago', 'pay-035-missing-profile', 'credits:035-missing-profile', 'user_035_missing', 1500, 'ARS');
    raise exception using errcode = 'P0001', message = 'missing_profile_settlement_not_rejected';
  exception when raise_exception then
    if sqlerrm = 'missing_profile_settlement_not_rejected' then
      raise;
    end if;
    if sqlerrm <> 'user_profile_not_found' then
      raise;
    end if;
  end;
end;
$profile_missing$;

select pg_temp.assert_true(
  exists (select 1 from public.credit_purchase_intents where reference = 'credits:035-missing-profile' and status = 'pending')
    and not exists (select 1 from public.payment_claims where payment_id = 'pay-035-missing-profile')
    and not exists (select 1 from public.credit_transactions where mp_payment_id = 'pay-035-missing-profile'),
  'missing_profile_settlement_left_residue'
);

create temp table reused_source as
with inserted as (
  insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
  values ('user_035_reused', 'basic', 1500, 'ARS', 3, 'credits:035-reused-source', pg_catalog.now() + pg_catalog.make_interval(mins => 1))
  returning id
)
select id from inserted;
insert into public.payment_claims (provider, payment_id, claim_state, subject_kind, subject_id)
select 'mercadopago', 'pay-035-reused', 'active', 'credit_intent', id from reused_source;
insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at)
values ('user_035_reused', 'basic', 1500, 'ARS', 3, 'credits:035-reused-target', pg_catalog.now() - pg_catalog.make_interval(mins => 1));

select pg_temp.assert_true(
  not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-035-reused', 'credits:035-reused-target', 'user_035_reused', 1500, 'ARS'))
    and (select credits = 0 from public.profiles where id = 'user_035_reused')
    and exists (select 1 from public.payment_claims where payment_id = 'pay-035-reused' and subject_id = (select id from reused_source))
    and exists (select 1 from public.credit_purchase_intents where reference = 'credits:035-reused-target' and status = 'pending')
    and not exists (select 1 from public.credit_transactions where user_id = 'user_035_reused'),
  'reused_payment_id_granted_credits'
);

select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = 'public.settle_credit_payment(text,text,text,text,numeric,text)'::pg_catalog.regprocedure)
    and not has_function_privilege('anon', 'public.settle_credit_payment(text,text,text,text,numeric,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.settle_credit_payment(text,text,text,text,numeric,text)', 'execute')
    and has_function_privilege('service_role', 'public.settle_credit_payment(text,text,text,text,numeric,text)', 'execute'),
  'settlement_security_definition_or_acl_incorrect'
);
select pg_temp.assert_settlement_execute_denied('anon');
select pg_temp.assert_settlement_execute_denied('authenticated');

select '035_credit_late_approval_settlement_proof_passed' as result;
rollback;
