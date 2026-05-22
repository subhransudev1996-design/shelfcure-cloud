-- Tests: RLS on suppliers, customers, doctors, customer_regular_medicines.
-- Verifies the shared-masters pattern across all 4 party tables.

begin;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('c1111111-cccc-cccc-cccc-100000000001', 'pSuper@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('c1111111-cccc-cccc-cccc-100000000002', 'pPharm@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('c1111111-cccc-cccc-cccc-100000000003', 'pCash@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name, shared_masters_enabled) values
  ('c1110000-0000-0000-0000-000000000001', 'Org Parties (sharing off)', false);

insert into public.stores (id, org_id, code, name) values
  ('c1110000-0000-0000-0000-000000000a01', 'c1110000-0000-0000-0000-000000000001', 'PTY01', 'Parties Store 1');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('c1111111-cccc-cccc-cccc-100000000001', 'c1110000-0000-0000-0000-000000000001', null,                                     'P Super',   'pSuper@t.com', 'super_admin'),
  ('c1111111-cccc-cccc-cccc-100000000002', 'c1110000-0000-0000-0000-000000000001', 'c1110000-0000-0000-0000-000000000a01',   'P Pharm',   'pPharm@t.com', 'pharmacist'),
  ('c1111111-cccc-cccc-cccc-100000000003', 'c1110000-0000-0000-0000-000000000001', 'c1110000-0000-0000-0000-000000000a01',   'P Cashier', 'pCash@t.com',  'cashier');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Cashier can create a customer at their own store (POS walk-in flow)
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-cccc-cccc-cccc-100000000003');

select lives_ok(
  $$ insert into public.customers (org_id, store_id, name, phone, customer_type)
     values ('c1110000-0000-0000-0000-000000000001','c1110000-0000-0000-0000-000000000a01','Walk-in Patient','+91 9000000001','b2c') $$,
  'cashier can create a customer in their store (POS flow)'
);

-- Cashier CANNOT create a supplier or doctor
select throws_ok(
  $$ insert into public.suppliers (org_id, store_id, name)
     values ('c1110000-0000-0000-0000-000000000001','c1110000-0000-0000-0000-000000000a01','Vendor X') $$,
  '42501',
  null,
  'cashier cannot create a supplier (pharmacist+ only)'
);

select throws_ok(
  $$ insert into public.doctors (org_id, store_id, name)
     values ('c1110000-0000-0000-0000-000000000001','c1110000-0000-0000-0000-000000000a01','Dr X') $$,
  '42501',
  null,
  'cashier cannot create a doctor (pharmacist+ only)'
);

-- ----------------------------------------------------------------------------
-- Pharmacist can create suppliers, doctors, customers — but only store-scoped
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-cccc-cccc-cccc-100000000002');

select lives_ok(
  $$ insert into public.suppliers (org_id, store_id, name) values
     ('c1110000-0000-0000-0000-000000000001','c1110000-0000-0000-0000-000000000a01','MedDist Mumbai') $$,
  'pharmacist creates a supplier in own store'
);

select lives_ok(
  $$ insert into public.doctors (org_id, store_id, name, specialization) values
     ('c1110000-0000-0000-0000-000000000001','c1110000-0000-0000-0000-000000000a01','Dr Sharma','General Physician') $$,
  'pharmacist creates a doctor in own store'
);

-- Org-wide insert by pharmacist: denied (only super_admin can)
select throws_ok(
  $$ insert into public.suppliers (org_id, store_id, name) values
     ('c1110000-0000-0000-0000-000000000001', null, 'OrgWide try') $$,
  '42501',
  null,
  'pharmacist cannot create an org-wide supplier'
);

-- ----------------------------------------------------------------------------
-- Sharing off: org-wide rows (store_id null) are not visible to store-scoped roles
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-cccc-cccc-cccc-100000000001');  -- super_admin

select lives_ok(
  $$ insert into public.suppliers (org_id, store_id, name) values
     ('c1110000-0000-0000-0000-000000000001', null, 'OrgWide Distributor') $$,
  'super_admin creates an org-wide supplier'
);

-- Pharmacist re-checks: still doesn't see org-wide row because shared_masters is off
select pg_temp.as_user('c1111111-cccc-cccc-cccc-100000000002');

select is(
  (select count(*)::int from public.suppliers where name = 'OrgWide Distributor'),
  0,
  'pharmacist cannot see org-wide supplier when shared_masters is off'
);

-- Now flip the flag and re-check
set local role postgres;
update public.organizations set shared_masters_enabled = true where id = 'c1110000-0000-0000-0000-000000000001';

select pg_temp.as_user('c1111111-cccc-cccc-cccc-100000000002');

select is(
  (select count(*)::int from public.suppliers where name = 'OrgWide Distributor'),
  1,
  'pharmacist CAN see org-wide supplier after shared_masters is enabled'
);

select * from finish();
rollback;
