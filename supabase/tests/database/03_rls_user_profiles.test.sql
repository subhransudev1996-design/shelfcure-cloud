-- Tests: RLS on user_profiles. Verifies cross-org isolation and intra-org role boundaries.

begin;

select plan(8);

-- Reuse fixture pattern from 02. Minimal here: two orgs, one user each + an extra in org A.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('c1111111-1111-1111-1111-111111111111', 'cA1@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('c2222222-2222-2222-2222-222222222222', 'cA2@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('d1111111-1111-1111-1111-111111111111', 'dB1@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Org Charlie'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Org Delta');

insert into public.stores (id, org_id, code, name) values
  ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'CHE01', 'Charlie Chennai');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('c1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null,                                  'C Super',   'cA1@t.com', 'super_admin'),
  ('c2222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc','cccc1111-cccc-cccc-cccc-cccccccccccc','C Cashier', 'cA2@t.com', 'cashier'),
  ('d1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', null,                                  'D Super',   'dB1@t.com', 'super_admin');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- super_admin sees all profiles in their org
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.user_profiles), 2,
  'super_admin sees both profiles in their own org');

select is((select count(*)::int from public.user_profiles where org_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 0,
  'super_admin cannot see other orgs'' profiles');

-- ----------------------------------------------------------------------------
-- cashier sees only themselves
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c2222222-2222-2222-2222-222222222222');

select is((select count(*)::int from public.user_profiles), 1,
  'cashier sees only their own profile');

select is((select role from public.user_profiles), 'cashier',
  'cashier sees their own row');

-- ----------------------------------------------------------------------------
-- cashier cannot self-promote
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ update public.user_profiles set role = 'super_admin' where id = auth.uid() $$,
  '42501',
  null,
  'cashier cannot self-promote (with-check on update_self enforces role unchanged)'
);

-- ----------------------------------------------------------------------------
-- super_admin can change role of subordinate
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ update public.user_profiles set role = 'pharmacist' where id = 'c2222222-2222-2222-2222-222222222222' $$,
  'super_admin can change subordinate role within own org'
);

-- ----------------------------------------------------------------------------
-- Cross-org: Delta super_admin sees only Delta
-- ----------------------------------------------------------------------------
select pg_temp.as_user('d1111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.user_profiles), 1,
  'Delta super_admin sees only their own profile (no Charlie profiles)');

-- ----------------------------------------------------------------------------
-- super_admin of Charlie cannot insert profile in Delta
-- ----------------------------------------------------------------------------
select pg_temp.as_user('c1111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ insert into public.user_profiles (id, org_id, store_id, full_name, email, role)
     values ('11111111-2222-3333-4444-555555555555', 'dddddddd-dddd-dddd-dddd-dddddddddddd', null, 'Hijack', 'h@t.com', 'super_admin') $$,
  '42501',
  null,
  'super_admin cannot insert profile in another org'
);

select * from finish();
rollback;
