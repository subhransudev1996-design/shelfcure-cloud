-- Tests: helper functions + onboarding RPC.
-- Run via: supabase test db (after `supabase start`).
--
-- Convention: each test file wraps in BEGIN..ROLLBACK so state never leaks.

begin;

select plan(12);

-- ============================================================================
-- Fixtures: two auth.users (raw insert; in real flow these come from GoTrue)
-- ============================================================================

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

-- Impersonate Alice
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ----------------------------------------------------------------------------
-- Helpers return NULL before any profile exists
-- ----------------------------------------------------------------------------
select is(public.current_org(),   null::uuid, 'current_org() is null before onboarding');
select is(public.current_role(),  null::text, 'current_role() is null before onboarding');
select is(public.current_store(), null::uuid, 'current_store() is null before onboarding');

-- ----------------------------------------------------------------------------
-- Onboarding RPC creates org + super_admin profile
-- ----------------------------------------------------------------------------
select lives_ok(
  $$ select public.rpc_create_org_with_owner('Alice Pharma', 'Alice Owner', '+91-9000000001') $$,
  'rpc_create_org_with_owner succeeds for new user'
);

select isnt(public.current_org(), null::uuid, 'current_org() returns the new org_id');
select is(public.current_role(), 'super_admin', 'new user is super_admin');
select is(public.current_store(), null::uuid, 'super_admin has no assigned store');

-- ----------------------------------------------------------------------------
-- Calling onboarding twice is rejected
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ select public.rpc_create_org_with_owner('Alice Pharma 2', 'Alice', null) $$,
  '23505',
  'profile_already_exists',
  'rpc_create_org_with_owner rejects duplicate onboarding'
);

-- ----------------------------------------------------------------------------
-- Bob can onboard independently without seeing Alice
-- ----------------------------------------------------------------------------
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(public.current_org(),  null::uuid, 'Bob has no org before onboarding (RLS isolates orgs)');
select is((select count(*)::int from public.organizations), 0, 'Bob sees zero orgs (only his own once onboarded)');

select lives_ok(
  $$ select public.rpc_create_org_with_owner('Bob Pharma', 'Bob Owner') $$,
  'Bob can onboard'
);

select is((select count(*)::int from public.organizations), 1, 'Bob still sees only his own org after onboarding');

-- ----------------------------------------------------------------------------
-- Alice sees only her own org after Bob onboards
-- ----------------------------------------------------------------------------
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.organizations), 1, 'Alice sees only her own org');

select * from finish();
rollback;
