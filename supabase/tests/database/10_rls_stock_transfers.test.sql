-- Tests: RLS on stock_transfers + stock_transfer_items.

begin;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'tSup@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'tPh1@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'tPh2@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000004', 'tCash@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('a0000000-1111-1111-1111-111111111111', 'Org Transfers');

insert into public.stores (id, org_id, code, name) values
  ('a0000000-1111-1111-1111-aaaaaaaaaaaa', 'a0000000-1111-1111-1111-111111111111', 'XFR01', 'From Store'),
  ('a0000000-1111-1111-1111-bbbbbbbbbbbb', 'a0000000-1111-1111-1111-111111111111', 'XFR02', 'To Store');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-1111-1111-1111-111111111111', null,                                       'T Super',   'tSup@t.com',  'super_admin'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-1111-1111-1111-111111111111', 'a0000000-1111-1111-1111-aaaaaaaaaaaa',     'T Pharm A', 'tPh1@t.com',  'pharmacist'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-1111-1111-1111-111111111111', 'a0000000-1111-1111-1111-bbbbbbbbbbbb',     'T Pharm B', 'tPh2@t.com',  'pharmacist'),
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-1111-1111-1111-111111111111', 'a0000000-1111-1111-1111-aaaaaaaaaaaa',     'T Cashier', 'tCash@t.com', 'cashier');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- Pharmacist at from-store can request a transfer
-- ============================================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.stock_transfers (id, org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by) values
     ('a0000000-5555-5555-5555-aaaaaaaaaaaa','a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-bbbbbbbbbbbb','T/A-B/001','request_approve','requested','a0000000-0000-0000-0000-000000000002') $$,
  'pharmacist at from-store can create a request_approve transfer'
);

-- ============================================================================
-- Pharmacist CANNOT use immediate flow (super_admin only)
-- ============================================================================
select throws_ok(
  $$ insert into public.stock_transfers (org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by) values
     ('a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-bbbbbbbbbbbb','T/IMMED','immediate','received','a0000000-0000-0000-0000-000000000002') $$,
  '42501',
  null,
  'pharmacist cannot create an immediate-flow transfer'
);

-- ============================================================================
-- Super admin can use immediate flow
-- ============================================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into public.stock_transfers (org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by) values
     ('a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-bbbbbbbbbbbb','T/IMMED/001','immediate','received','a0000000-0000-0000-0000-000000000001') $$,
  'super_admin can create immediate transfer'
);

-- ============================================================================
-- Both pharmacists see the transfer (they have access to one side each)
-- ============================================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');  -- pharm at TO store

select is(
  (select count(*)::int from public.stock_transfers where transfer_no = 'T/A-B/001'),
  1,
  'pharmacist at TO store can see the inbound transfer'
);

-- ============================================================================
-- Cashier cannot create or approve transfers
-- ============================================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004');

select throws_ok(
  $$ insert into public.stock_transfers (org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by) values
     ('a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-bbbbbbbbbbbb','T/CASH-TRY','request_approve','requested','a0000000-0000-0000-0000-000000000004') $$,
  '42501',
  null,
  'cashier cannot create a transfer'
);

-- ============================================================================
-- Same store cannot transfer to itself
-- ============================================================================
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.stock_transfers (org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by) values
     ('a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-aaaaaaaaaaaa','T/SAME','immediate','received','a0000000-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'cannot transfer from a store to itself'
);

-- ============================================================================
-- Idempotency: duplicate client_uuid
-- ============================================================================
select throws_ok(
  $$ insert into public.stock_transfers (org_id, from_store_id, to_store_id, transfer_no, flow, status, requested_by, client_uuid) values
     ('a0000000-1111-1111-1111-111111111111','a0000000-1111-1111-1111-aaaaaaaaaaaa','a0000000-1111-1111-1111-bbbbbbbbbbbb','T/DUP','immediate','received','a0000000-0000-0000-0000-000000000001',
      (select client_uuid from public.stock_transfers where transfer_no = 'T/IMMED/001')) $$,
  '23505',
  null,
  'duplicate client_uuid is rejected (idempotency)'
);

select * from finish();
rollback;
