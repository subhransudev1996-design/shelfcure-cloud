-- Tests: RLS on sales, sale_items, sale_payments, sale_returns.
-- Cashier can CREATE but not UPDATE (post-commit immutability).

begin;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('80000000-0000-0000-0000-000000000001', 'sSup@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000002', 'sPharm@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000003', 'sCash@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('80000000-1111-1111-1111-111111111111', 'Org Sales');

insert into public.stores (id, org_id, code, name) values
  ('80000000-1111-1111-1111-aaaaaaaaaaaa', '80000000-1111-1111-1111-111111111111', 'SAL01', 'Sales Store');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('80000000-0000-0000-0000-000000000001', '80000000-1111-1111-1111-111111111111', null,                                       'S Super',   'sSup@t.com',   'super_admin'),
  ('80000000-0000-0000-0000-000000000002', '80000000-1111-1111-1111-111111111111', '80000000-1111-1111-1111-aaaaaaaaaaaa',     'S Pharm',   'sPharm@t.com', 'pharmacist'),
  ('80000000-0000-0000-0000-000000000003', '80000000-1111-1111-1111-111111111111', '80000000-1111-1111-1111-aaaaaaaaaaaa',     'S Cashier', 'sCash@t.com',  'cashier');

insert into public.medicines (id, org_id, store_id, name, dosage_form_id) values
  ('80000000-3333-3333-3333-aaaaaaaaaaaa', '80000000-1111-1111-1111-111111111111', '80000000-1111-1111-1111-aaaaaaaaaaaa', 'POS Med',
   (select id from public.dosage_forms where name = 'Tablet' limit 1));

insert into public.batches (id, org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage) values
  ('80000000-4444-4444-4444-aaaaaaaaaaaa', '80000000-1111-1111-1111-111111111111', '80000000-1111-1111-1111-aaaaaaaaaaaa',
   '80000000-3333-3333-3333-aaaaaaaaaaaa', 'POS-B1', '2027-12-31', 100, 50, 12);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- Cashier creates a sale + items + payments (POS happy path)
-- ============================================================================
select pg_temp.as_user('80000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.sales (id, org_id, store_id, bill_number, bill_date, subtotal, total_amount, paid_amount) values
     ('80000000-5555-5555-5555-aaaaaaaaaaaa','80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','S/001','2026-05-22',100,112,112) $$,
  'cashier can create a sale (POS happy path)'
);

select lives_ok(
  $$ insert into public.sale_items (org_id, store_id, sale_id, medicine_id, batch_id, quantity, mrp, gst_percentage, amount, taxable_amount) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa','80000000-3333-3333-3333-aaaaaaaaaaaa','80000000-4444-4444-4444-aaaaaaaaaaaa',2,50,12,100,89.29) $$,
  'cashier can create a sale_item'
);

select lives_ok(
  $$ insert into public.sale_payments (org_id, store_id, sale_id, payment_method, amount) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa','cash',112) $$,
  'cashier can record a payment'
);

-- ============================================================================
-- Cashier CANNOT update a sale after creation (immutability via RLS)
-- ============================================================================
select throws_ok(
  $$ update public.sales set total_amount = 200 where bill_number = 'S/001' $$,
  '42501',
  null,
  'cashier cannot update sale post-commit'
);

-- ============================================================================
-- Misc item: medicine_id + batch_id must be NULL when is_misc_item = true
-- ============================================================================
select lives_ok(
  $$ insert into public.sale_items (org_id, store_id, sale_id, is_misc_item, misc_note, quantity, mrp, amount, taxable_amount) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa',true,'Delivery charge',1,30,30,30) $$,
  'misc item with NULL medicine_id/batch_id is allowed'
);

select throws_ok(
  $$ insert into public.sale_items (org_id, store_id, sale_id, is_misc_item, medicine_id, quantity, mrp, amount, taxable_amount) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa',true,'80000000-3333-3333-3333-aaaaaaaaaaaa',1,30,30,30) $$,
  '23514',
  null,
  'misc item with medicine_id is rejected by check constraint'
);

select throws_ok(
  $$ insert into public.sale_items (org_id, store_id, sale_id, is_misc_item, quantity, mrp, amount, taxable_amount) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa',false,1,30,30,30) $$,
  '23514',
  null,
  'non-misc item without medicine_id/batch_id is rejected'
);

-- ============================================================================
-- Pharmacist can modify a sale (post-commit edit flow)
-- ============================================================================
select pg_temp.as_user('80000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.sales
     set is_modified = true, modification_note = 'Customer requested change', modified_at = now(), total_amount = 142
     where bill_number = 'S/001' $$,
  'pharmacist can update a committed sale'
);

-- ============================================================================
-- Cashier creates a sale_return (refund flow)
-- ============================================================================
select pg_temp.as_user('80000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.sale_returns (org_id, store_id, sale_id, return_number, return_date, total_amount, refund_method) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','80000000-5555-5555-5555-aaaaaaaaaaaa','SR/001','2026-05-22',50,'cash') $$,
  'cashier can create a sale_return'
);

-- ============================================================================
-- Idempotency: duplicate client_uuid rejected
-- ============================================================================
select throws_ok(
  $$ insert into public.sales (org_id, store_id, bill_number, bill_date, total_amount, paid_amount, client_uuid) values
     ('80000000-1111-1111-1111-111111111111','80000000-1111-1111-1111-aaaaaaaaaaaa','S/002','2026-05-22',100,100,
      (select client_uuid from public.sales where bill_number = 'S/001')) $$,
  '23505',
  null,
  'duplicate sale client_uuid is rejected (idempotency)'
);

select * from finish();
rollback;
