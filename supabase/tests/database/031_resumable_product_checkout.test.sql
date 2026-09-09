-- Run against a fresh disposable PostgreSQL 17 database after all migrations.
do $guard$ begin if current_setting('app.disposable_test', true) is distinct from 'true' then raise exception 'disposable_database_guard_required'; end if; end $guard$;
create function pg_temp.assert_true(p_condition boolean, p_case text) returns void language plpgsql as $assert$ begin if not coalesce(p_condition, false) then raise exception using errcode = 'P0001', message = p_case; end if; end $assert$;

insert into public.profiles (id, email, credits) values
  ('resume_owner', 'resume-owner@example.invalid', 0),
  ('resume_other', 'resume-other@example.invalid', 0),
  ('resume_coupon_owner', 'resume-coupon@example.invalid', 0),
  ('resume_permutation_owner', 'resume-permutation@example.invalid', 0),
  ('resume_expired_owner', 'resume-expired@example.invalid', 0);
insert into public.products (id, title, slug, price, category) values
  ('31000000-0000-0000-0000-000000000001', 'Resume promotions', 'resume-promotions', 100, 'fixture'),
  ('31000000-0000-0000-0000-000000000002', 'Resume mismatch', 'resume-mismatch', 100, 'fixture'),
  ('31000000-0000-0000-0000-000000000003', 'Resume coupon', 'resume-coupon', 100, 'fixture'),
  ('31000000-0000-0000-0000-000000000004', 'Resume permutation A', 'resume-permutation-a', 100, 'fixture'),
  ('31000000-0000-0000-0000-000000000005', 'Resume permutation B', 'resume-permutation-b', 100, 'fixture'),
  ('31000000-0000-0000-0000-000000000006', 'Resume expired', 'resume-expired', 100, 'fixture');

create temp table promotions_checkout as
select * from public.create_product_checkout(
  'resume_owner',
  jsonb_build_object('email', 'resume-owner@example.invalid', 'fullName', 'Resume Owner'),
  array['31000000-0000-0000-0000-000000000001'::uuid],
  0,
  'promotions', null, null, null
);
select public.attach_order_preference(order_id, 'preference-promotions', expires_at) from promotions_checkout;

select pg_temp.assert_true(
  (select count(*) = 1 from public.get_resumable_product_checkout(
     'resume_owner', array['31000000-0000-0000-0000-000000000001'::uuid], 'promotions', null, null, null
   ))
  and exists (select 1 from public.get_resumable_product_checkout(
    'resume_owner', array['31000000-0000-0000-0000-000000000001'::uuid], 'promotions', null, null, null
  ) as resumed where resumed.order_id = (select order_id from promotions_checkout) and resumed.preference_id = 'preference-promotions' and resumed.reference = (select reference from promotions_checkout))
  and (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_other', array['31000000-0000-0000-0000-000000000001'::uuid], 'promotions', null, null, null
  ))
  and (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_owner', array['31000000-0000-0000-0000-000000000002'::uuid], 'promotions', null, null, null
  )),
  'resume_must_require_owner_and_exact_cart_product_set'
);

update public.inventory_reservations
set status = 'released', released_at = statement_timestamp(), release_reason = 'test_boundary'
where order_id = (select order_id from promotions_checkout);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_owner', array['31000000-0000-0000-0000-000000000001'::uuid], 'promotions', null, null, null
  )),
  'resume_must_require_an_active_reservation_for_every_cart_product'
);

create temp table permutation_checkout as
select * from public.create_product_checkout(
  'resume_permutation_owner',
  jsonb_build_object('email', 'resume-permutation@example.invalid', 'fullName', 'Permutation Owner'),
  array['31000000-0000-0000-0000-000000000004'::uuid, '31000000-0000-0000-0000-000000000005'::uuid],
  0,
  'promotions', null, null, null
);
select public.attach_order_preference(order_id, 'preference-permutation', expires_at) from permutation_checkout;
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_resumable_product_checkout(
    'resume_permutation_owner', array['31000000-0000-0000-0000-000000000005'::uuid, '31000000-0000-0000-0000-000000000004'::uuid], 'promotions', null, null, null
  ))
  and (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_permutation_owner', array['31000000-0000-0000-0000-000000000004'::uuid], 'promotions', null, null, null
  )),
  'resume_must_accept_cart_permutations_but_reject_material_cart_changes'
);

select public.create_coupon('resume_admin', 'RESUME1', 1, statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', 1000, null) as resume_coupon_id \gset
create temp table coupon_checkout as
select * from public.create_product_checkout(
  'resume_coupon_owner',
  jsonb_build_object('email', 'resume-coupon@example.invalid', 'fullName', 'Coupon Owner'),
  array['31000000-0000-0000-0000-000000000003'::uuid],
  0,
  'coupon', 'RESUME1', 'v1', repeat('a', 64)
);
select public.attach_order_preference(order_id, 'preference-coupon', expires_at) from coupon_checkout;

select pg_temp.assert_true(
  (select count(*) = 1 from public.get_resumable_product_checkout(
    'resume_coupon_owner', array['31000000-0000-0000-0000-000000000003'::uuid], 'coupon', 'RESUME1', 'v1', repeat('a', 64)
  ))
  and (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_coupon_owner', array['31000000-0000-0000-0000-000000000003'::uuid], 'coupon', 'RESUME1', 'v1', repeat('b', 64)
  ))
  and (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_coupon_owner', array['31000000-0000-0000-0000-000000000003'::uuid], 'coupon', 'OTHER1', 'v1', repeat('a', 64)
  )),
  'resume_must_require_the_original_coupon_and_identity'
);

do $duplicates$
begin
  begin
    perform public.get_resumable_product_checkout(
      'resume_owner',
      array['31000000-0000-0000-0000-000000000001'::uuid, '31000000-0000-0000-0000-000000000001'::uuid],
      'promotions', null, null, null
    );
    raise exception 'duplicate_cart_accepted';
  exception when others then
    if sqlerrm <> 'invalid_resumable_product_checkout' then raise; end if;
  end;
end;
$duplicates$;

create temp table expired_checkout as
select * from public.create_product_checkout(
  'resume_expired_owner',
  jsonb_build_object('email', 'resume-expired@example.invalid', 'fullName', 'Expired Owner'),
  array['31000000-0000-0000-0000-000000000006'::uuid],
  0,
  'promotions', null, null, null
);
select public.attach_order_preference(order_id, 'preference-expired', expires_at) from expired_checkout;
select public.expire_product_reservations(statement_timestamp() + interval '1 hour', 10);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_resumable_product_checkout(
    'resume_expired_owner', array['31000000-0000-0000-0000-000000000006'::uuid], 'promotions', null, null, null
  )),
  'resume_must_not_return_an_expired_candidate'
);

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.get_resumable_product_checkout(text,uuid[],text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_resumable_product_checkout(text,uuid[],text,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.get_resumable_product_checkout(text,uuid[],text,text,text,text)', 'execute'),
  'resumable_checkout_lookup_must_remain_server_only'
);
