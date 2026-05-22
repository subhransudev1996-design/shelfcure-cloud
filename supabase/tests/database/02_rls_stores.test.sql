-- Tests: RLS policies on stores table across roles.
-- Verifies the matrix: super_admin / store_admin / pharmacist / cashier / accountant
-- × select / insert / update / delete.

begin;

select plan(14);

-- ============================================================================
-- Setup: two orgs, each with 2 stores and a full set of roles
-- ============================================================================

-- Org A
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('a1111111-1111-1111-1111-111111111111', 'super@a.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a2222222-2222-2222-2222-222222222222', 'storeadm@a.com','{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a3333333-3333-3333-3333-333333333333', 'pharm@a.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a4444444-4444-4444-4444-444444444444', 'cash@a.com',    '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a5555555-5555-5555-5555-555555555555', 'acct@a.com',    '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

-- Org B (single user, isolation test)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('b1111111-1111-1111-1111-111111111111', 'super@b.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

-- Insert orgs/stores/profiles via service_role bypassing RLS (test fixture path).
set local role postgres;

insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Org Alpha'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org Bravo');

insert into public.stores (id, org_id, code, name) values
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BLR01', 'Alpha Bangalore'),
  ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BLR02', 'Alpha Bangalore II'),
  ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DEL01', 'Bravo Delhi');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,                                   'A SuperAdmin',  'super@a.com',    'super_admin'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A StoreAdmin',  'storeadm@a.com', 'store_admin'),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Pharmacist',  'pharm@a.com',    'pharmacist'),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Cashier',     'cash@a.com',     'cashier'),
  ('a5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,                                   'A Accountant',  'acct@a.com',     'accountant'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null,                                   'B SuperAdmin',  'super@b.com',    'super_admin');

-- Helper: switch to a given user.
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- super_admin (Alpha): sees both Alpha stores, not Bravo
-- ============================================================================
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.stores), 2,
  'super_admin sees all 2 stores in their org');

select is((select count(*)::int from public.stores where org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0,
  'super_admin cannot see another org''s stores');

select lives_ok(
  $$ insert into public.stores (org_id, code, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BLR03', 'Alpha BLR III') $$,
  'super_admin can insert a store in own org'
);

select throws_ok(
  $$ insert into public.stores (org_id, code, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'EVIL', 'Hijack') $$,
  '42501',
  null,
  'super_admin cannot insert a store in another org'
);

-- ============================================================================
-- store_admin (Alpha BLR01): sees only their store
-- ============================================================================
select pg_temp.as_user('a2222222-2222-2222-2222-222222222222');

select is((select count(*)::int from public.stores), 1,
  'store_admin sees only their own store');

select is((select code from public.stores limit 1), 'BLR01',
  'store_admin sees the correct store (BLR01)');

select throws_ok(
  $$ insert into public.stores (org_id, code, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BLR04', 'try') $$,
  '42501',
  null,
  'store_admin cannot insert new stores'
);

-- ============================================================================
-- pharmacist (Alpha BLR01): sees only their store, no writes
-- ============================================================================
select pg_temp.as_user('a3333333-3333-3333-3333-333333333333');

select is((select count(*)::int from public.stores), 1,
  'pharmacist sees only their own store');

select throws_ok(
  $$ update public.stores set name = 'hacked' where code = 'BLR01' $$,
  '42501',
  null,
  'pharmacist cannot update stores'
);

-- ============================================================================
-- cashier: same as pharmacist on stores (read own, no writes)
-- ============================================================================
select pg_temp.as_user('a4444444-4444-4444-4444-444444444444');

select is((select count(*)::int from public.stores), 1,
  'cashier sees only their own store');

-- ============================================================================
-- accountant (Alpha): org-wide read, no writes
-- ============================================================================
select pg_temp.as_user('a5555555-5555-5555-5555-555555555555');

select is((select count(*)::int from public.stores), 3,
  'accountant sees all stores in their org (after super_admin added BLR03)');

select throws_ok(
  $$ update public.stores set name = 'hacked' where code = 'BLR01' $$,
  '42501',
  null,
  'accountant cannot update stores'
);

-- ============================================================================
-- Cross-org: super_admin of Bravo sees only Bravo
-- ============================================================================
select pg_temp.as_user('b1111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.stores), 1,
  'Bravo super_admin sees only Bravo stores (cross-org isolation)');

select * from finish();
rollback;
