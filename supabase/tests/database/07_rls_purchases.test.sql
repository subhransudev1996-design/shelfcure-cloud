-- Tests: RLS on purchases + items + returns + orders + challans.
-- All stock-inbound tables are store-scoped.

begin;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('70000000-0000-0000-0000-000000000001', 'pSup@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('70000000-0000-0000-0000-000000000002', 'pPharm@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('70000000-0000-0000-0000-000000000003', 'pCash@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('70000000-1111-1111-1111-111111111111', 'Org Purchases');

insert into public.stores (id, org_id, code, name) values
  ('70000000-1111-1111-1111-aaaaaaaaaaaa', '70000000-1111-1111-1111-111111111111', 'PCH01', 'Purchase Store');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('70000000-0000-0000-0000-000000000001', '70000000-1111-1111-1111-111111111111', null,                                       'P Super',   'pSup@t.com',   'super_admin'),
  ('70000000-0000-0000-0000-000000000002', '70000000-1111-1111-1111-111111111111', '70000000-1111-1111-1111-aaaaaaaaaaaa',     'P Pharm',   'pPharm@t.com', 'pharmacist'),
  ('70000000-0000-0000-0000-000000000003', '70000000-1111-1111-1111-111111111111', '70000000-1111-1111-1111-aaaaaaaaaaaa',     'P Cashier', 'pCash@t.com',  'cashier');

insert into public.suppliers (id, org_id, store_id, name) values
  ('70000000-2222-2222-2222-aaaaaaaaaaaa', '70000000-1111-1111-1111-111111111111', '70000000-1111-1111-1111-aaaaaaaaaaaa', 'Supplier One');

insert into public.medicines (id, org_id, store_id, name, dosage_form_id) values
  ('70000000-3333-3333-3333-aaaaaaaaaaaa', '70000000-1111-1111-1111-111111111111', '70000000-1111-1111-1111-aaaaaaaaaaaa', 'Test Med',
   (select id from public.dosage_forms where name = 'Tablet' limit 1));

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Pharmacist can create a purchase + items
-- ----------------------------------------------------------------------------
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.purchases (id, org_id, store_id, supplier_id, bill_number, bill_date, subtotal, total_amount) values
     ('70000000-4444-4444-4444-aaaaaaaaaaaa','70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','BILL/001','2026-05-22',1000,1120) $$,
  'pharmacist can insert a purchase'
);

select lives_ok(
  $$ insert into public.purchase_items (org_id, store_id, purchase_id, medicine_id, batch_number, expiry_date, quantity, purchase_rate, mrp, gst_percentage, amount) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-4444-4444-4444-aaaaaaaaaaaa','70000000-3333-3333-3333-aaaaaaaaaaaa','B-A1','2027-12-31',100,8,12,12,800) $$,
  'pharmacist can insert a purchase_item'
);

select lives_ok(
  $$ insert into public.challans (id, org_id, store_id, supplier_id, challan_number, challan_date) values
     ('70000000-5555-5555-5555-aaaaaaaaaaaa','70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','CH/001','2026-05-22') $$,
  'pharmacist can insert a challan'
);

select lives_ok(
  $$ insert into public.purchase_orders (org_id, store_id, supplier_id, order_date) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','2026-05-22') $$,
  'pharmacist can insert a purchase_order'
);

-- ----------------------------------------------------------------------------
-- Cashier: read-only on stock-inbound
-- ----------------------------------------------------------------------------
select pg_temp.as_user('70000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.purchases),
  1,
  'cashier can read purchases in their store'
);

select throws_ok(
  $$ insert into public.purchases (org_id, store_id, supplier_id, bill_number, bill_date) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','SHOULD-FAIL','2026-05-22') $$,
  '42501',
  null,
  'cashier cannot insert a purchase'
);

select throws_ok(
  $$ insert into public.challans (org_id, store_id, supplier_id, challan_number, challan_date) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','CH-SHOULD-FAIL','2026-05-22') $$,
  '42501',
  null,
  'cashier cannot insert a challan'
);

-- ----------------------------------------------------------------------------
-- Idempotency: duplicate client_uuid is rejected
-- ----------------------------------------------------------------------------
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ insert into public.purchases (org_id, store_id, supplier_id, bill_number, bill_date, client_uuid) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','BILL/002','2026-05-22',
      (select client_uuid from public.purchases where bill_number = 'BILL/001')) $$,
  '23505',
  null,
  'duplicate client_uuid is rejected (idempotency)'
);

-- ----------------------------------------------------------------------------
-- Unique constraint on (store_id, bill_number, supplier_id)
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.purchases (org_id, store_id, supplier_id, bill_number, bill_date) values
     ('70000000-1111-1111-1111-111111111111','70000000-1111-1111-1111-aaaaaaaaaaaa','70000000-2222-2222-2222-aaaaaaaaaaaa','BILL/001','2026-05-23') $$,
  '23505',
  null,
  'cannot insert duplicate (store, bill_number, supplier)'
);

select * from finish();
rollback;
