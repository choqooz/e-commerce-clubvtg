-- Run only against a fresh disposable database built through migration 015.
do $guard$ begin if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if; end $guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$
begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end $assert$;

insert into public.profiles (id, email, credits) values
  ('user_016_a', 'a@example.invalid', 0), ('user_016_b', 'b@example.invalid', 0), ('user_016_fail', 'fail@example.invalid', 0);

\ir ../../migrations/016_credit_purchase_transactions.sql

create temp table main_intent as
  select * from public.create_credit_purchase_intent('user_016_a', 'basic', 1500, 'credits:016-main', 3);
select pg_temp.assert_true((select public.attach_credit_preference(id, 'pref-016-main', expires_at) from main_intent), 'attach_failed');
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-wrong-amount', 'credits:016-main', 'user_016_a', 1499, 'ARS')), 'wrong_amount_granted');
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-wrong-currency', 'credits:016-main', 'user_016_a', 1500, 'USD')), 'wrong_currency_granted');
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-wrong-reference', 'credits:016-other', 'user_016_a', 1500, 'ARS')), 'wrong_reference_granted');
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-wrong-user', 'credits:016-main', 'user_016_b', 1500, 'ARS')), 'wrong_user_granted');
select pg_temp.assert_true((select credits = 0 from public.profiles where id = 'user_016_a') and not exists (select 1 from public.payment_claims where payment_id like 'pay-016-wrong-%') and not exists (select 1 from public.credit_transactions where reason = 'mp_credit_settlement'), 'invalid_settlement_left_residue');

do $invalid_pack$ begin
  begin perform public.create_credit_purchase_intent('user_016_a', 'forged', 1500, 'credits:016-forged', 3); raise exception 'forged_pack_admitted';
  exception when raise_exception then if sqlerrm = 'forged_pack_admitted' then raise; end if; end;
end $invalid_pack$;
select pg_temp.assert_true(not exists (select 1 from public.credit_purchase_intents where reference = 'credits:016-forged'), 'forged_pack_persisted');

create temp table first_result as select * from public.settle_credit_payment('mercadopago', 'pay-016-main', 'credits:016-main', 'user_016_a', 1500, 'ARS');
select pg_temp.assert_true((select newly_applied from first_result) and (select credits = 3 from public.profiles where id = 'user_016_a') and exists (select 1 from public.credit_transactions where user_id = 'user_016_a' and amount = 3 and mp_payment_id = 'pay-016-main'), 'first_application_not_atomic');
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-main', 'credits:016-main', 'user_016_a', 1500, 'ARS')) and (select credits = 3 from public.profiles where id = 'user_016_a'), 'duplicate_not_noop');

create temp table cancelled_intent as select * from public.create_credit_purchase_intent('user_016_b', 'basic', 1500, 'credits:016-cancelled', 3);
select pg_temp.assert_true((select public.cancel_credit_purchase_intent(id, 'preference_failed') from cancelled_intent) and not (select public.attach_credit_preference(id, 'pref-016-cancelled', expires_at) from cancelled_intent) and not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-cancelled', 'credits:016-cancelled', 'user_016_b', 1500, 'ARS')), 'cancel_compensation_failed');
insert into public.credit_purchase_intents (user_id, pack_id, amount, currency, credits, reference, expires_at) values ('user_016_b', 'basic', 1500, 'ARS', 3, 'credits:016-expired', pg_catalog.now() - pg_catalog.make_interval(mins => 1));
select pg_temp.assert_true(not (select newly_applied from public.settle_credit_payment('mercadopago', 'pay-016-expired', 'credits:016-expired', 'user_016_b', 1500, 'ARS')) and not exists (select 1 from public.payment_claims where payment_id = 'pay-016-expired'), 'expired_intent_granted');

create temp table failure_intent as select * from public.create_credit_purchase_intent('user_016_fail', 'basic', 1500, 'credits:016-failure', 3);
create function pg_temp.reject_credit_ledger() returns trigger language plpgsql as $trigger$ begin raise exception 'ledger_rejected'; end $trigger$;
create trigger reject_credit_ledger before insert on public.credit_transactions for each row when (new.user_id = 'user_016_fail') execute function pg_temp.reject_credit_ledger();
do $atomic_failure$ begin
  begin perform public.settle_credit_payment('mercadopago', 'pay-016-failure', 'credits:016-failure', 'user_016_fail', 1500, 'ARS'); raise exception 'ledger_failure_not_raised';
  exception when raise_exception then if sqlerrm = 'ledger_failure_not_raised' then raise; end if; end;
end $atomic_failure$;
select pg_temp.assert_true((select credits = 0 from public.profiles where id = 'user_016_fail') and not exists (select 1 from public.payment_claims where payment_id = 'pay-016-failure') and not exists (select 1 from public.credit_transactions where user_id = 'user_016_fail') and (select status = 'pending' from public.credit_purchase_intents where reference = 'credits:016-failure'), 'ledger_failure_left_residue');
drop trigger reject_credit_ledger on public.credit_transactions;

do $immutable$ begin
  begin update public.credit_purchase_intents set amount = 1 where reference = 'credits:016-main'; raise exception 'immutable_authority_changed';
  exception when raise_exception then if sqlerrm = 'immutable_authority_changed' then raise; end if; end;
end $immutable$;
select pg_temp.assert_true(not has_function_privilege('anon', 'public.settle_credit_payment(text,text,text,text,numeric,text)', 'execute') and has_function_privilege('service_role', 'public.settle_credit_payment(text,text,text,text,numeric,text)', 'execute'), 'settlement_acl_incorrect');
select count(*) as credit_intents, (select count(*) from public.payment_claims where subject_kind = 'credit_intent') as credit_claims, (select count(*) from public.credit_transactions where reason = 'mp_credit_settlement') as grants from public.credit_purchase_intents;
