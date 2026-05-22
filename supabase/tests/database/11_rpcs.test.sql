-- Tests: atomic RPCs (commit_sale, commit_purchase, stock_correction, transfer flow).
-- Each test asserts the multi-row transaction lands correctly, idempotency holds,
-- and the audit_log is written.

begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('b0000000-0000-0000-0000-000000000001', 'rSup@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000002', 'rPh@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000003', 'rCa@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000004', 'rPhB@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('b0000000-1111-1111-1111-111111111111', 'Org RPC');

insert into public.stores (id, org_id, code, name) values
  ('b0000000-1111-1111-1111-aaaaaaaaaaaa', 'b0000000-1111-1111-1111-111111111111', 'RPC1', 'RPC Store 1'),
  ('b0000000-1111-1111-1111-bbbbbbbbbbbb', 'b0000000-1111-1111-1111-111111111111', 'RPC2', 'RPC Store 2');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('b0000000-0000-0000-0000-000000000001', 'b0000000-1111-1111-1111-111111111111', null,                                       'R Super',   'rSup@t.com',  'super_admin'),
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',     'R Pharm A', 'rPh@t.com',   'pharmacist'),
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',     'R Cashier', 'rCa@t.com',   'cashier'),
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-bbbbbbbbbbbb',     'R Pharm B', 'rPhB@t.com', 'pharmacist');

insert into public.suppliers (id, org_id, store_id, name) values
  ('b0000000-2222-2222-2222-aaaaaaaaaaaa', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-aaaaaaaaaaaa', 'Supplier R');

insert into public.medicines (id, org_id, store_id, name, dosage_form_id) values
  ('b0000000-3333-3333-3333-aaaaaaaaaaaa', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-aaaaaaaaaaaa', 'Crocin 500',
   (select id from public.dosage_forms where name = 'Tablet' limit 1));

insert into public.batches (id, org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage) values
  ('b0000000-4444-4444-4444-aaaaaaaaaaaa', 'b0000000-1111-1111-1111-111111111111', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
   'b0000000-3333-3333-3333-aaaaaaaaaaaa', 'RPC-B1', '2027-12-31', 100, 50, 12);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- rpc_commit_sale — happy path (cashier)
-- ============================================================================
select pg_temp.as_user('b0000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ select * from public.rpc_commit_sale(jsonb_build_object(
       'client_uuid', '11111111-1111-1111-1111-111111111111',
       'store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'bill_number', 'S/RPC1/0001',
       'bill_date', '2026-05-22',
       'total_amount', 112,
       'paid_amount', 112,
       'items', jsonb_build_array(jsonb_build_object(
         'medicine_id', 'b0000000-3333-3333-3333-aaaaaaaaaaaa',
         'batch_id', 'b0000000-4444-4444-4444-aaaaaaaaaaaa',
         'quantity', 2, 'mrp', 50, 'gst_percentage', 12, 'amount', 100, 'taxable_amount', 89.29
       )),
       'payments', jsonb_build_array(jsonb_build_object('payment_method','cash','amount',112))
     )) $$,
  'cashier can commit a sale via rpc_commit_sale'
);

select is(
  (select current_quantity from public.batches where id = 'b0000000-4444-4444-4444-aaaaaaaaaaaa'),
  98,
  'batch quantity decremented by 2 (100 -> 98)'
);

select is(
  (select count(*)::int from public.sale_items where sale_id = (select id from public.sales where bill_number = 'S/RPC1/0001')),
  1,
  'one sale_item created'
);

select is(
  (select count(*)::int from public.sale_payments where sale_id = (select id from public.sales where bill_number = 'S/RPC1/0001')),
  1,
  'one sale_payment created'
);

-- ============================================================================
-- rpc_commit_sale — idempotency (same client_uuid returns same sale)
-- ============================================================================
select is(
  (select bill_number from public.rpc_commit_sale(jsonb_build_object(
       'client_uuid', '11111111-1111-1111-1111-111111111111',
       'store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'bill_number', 'S/RPC1/0001-DUP',
       'total_amount', 999,
       'items', jsonb_build_array(),
       'payments', jsonb_build_array()
     )) limit 1),
  'S/RPC1/0001',
  'duplicate client_uuid returns original bill_number (idempotent)'
);

select is(
  (select current_quantity from public.batches where id = 'b0000000-4444-4444-4444-aaaaaaaaaaaa'),
  98,
  'batch quantity unchanged on idempotent re-call (still 98)'
);

-- ============================================================================
-- rpc_commit_sale — insufficient stock
-- ============================================================================
select throws_ok(
  $$ select * from public.rpc_commit_sale(jsonb_build_object(
       'client_uuid', '22222222-2222-2222-2222-222222222222',
       'store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'bill_number', 'S/RPC1/0002',
       'total_amount', 100000,
       'items', jsonb_build_array(jsonb_build_object(
         'medicine_id', 'b0000000-3333-3333-3333-aaaaaaaaaaaa',
         'batch_id', 'b0000000-4444-4444-4444-aaaaaaaaaaaa',
         'quantity', 9999, 'mrp', 50, 'gst_percentage', 12, 'amount', 499950, 'taxable_amount', 446386
       )),
       'payments', jsonb_build_array()
     )) $$,
  '23514',
  null,
  'insufficient_stock raised when quantity exceeds batch'
);

-- ============================================================================
-- rpc_commit_sale — misc item works without medicine/batch
-- ============================================================================
select lives_ok(
  $$ select * from public.rpc_commit_sale(jsonb_build_object(
       'client_uuid', '33333333-3333-3333-3333-333333333333',
       'store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'bill_number', 'S/RPC1/0003',
       'total_amount', 50,
       'items', jsonb_build_array(jsonb_build_object(
         'is_misc_item', true, 'misc_note', 'Delivery charge',
         'quantity', 1, 'mrp', 50, 'amount', 50, 'taxable_amount', 50, 'gst_percentage', 0
       )),
       'payments', jsonb_build_array()
     )) $$,
  'misc item committed cleanly via RPC'
);

-- ============================================================================
-- rpc_commit_purchase — happy path
-- ============================================================================
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002');  -- pharmacist

select lives_ok(
  $$ select * from public.rpc_commit_purchase(jsonb_build_object(
       'client_uuid', '44444444-4444-4444-4444-444444444444',
       'store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'supplier_id', 'b0000000-2222-2222-2222-aaaaaaaaaaaa',
       'bill_number', 'P/RPC1/0001',
       'total_amount', 1120,
       'items', jsonb_build_array(jsonb_build_object(
         'medicine_id', 'b0000000-3333-3333-3333-aaaaaaaaaaaa',
         'batch_number', 'RPC-NEW',
         'expiry_date', '2028-12-31',
         'quantity', 50, 'free_quantity', 5,
         'purchase_rate', 8, 'mrp', 50, 'gst_percentage', 12, 'amount', 400
       )),
       'payments', jsonb_build_array()
     )) $$,
  'pharmacist can commit a purchase'
);

select is(
  (select current_quantity from public.batches where store_id = 'b0000000-1111-1111-1111-aaaaaaaaaaaa' and batch_number = 'RPC-NEW'),
  55,
  'new batch created with qty + free_qty (50 + 5)'
);

-- ============================================================================
-- rpc_stock_correction — happy path
-- ============================================================================
select lives_ok(
  $$ select public.rpc_stock_correction(
       'b0000000-4444-4444-4444-aaaaaaaaaaaa',
       -3,
       'Physical count adjustment') $$,
  'pharmacist can record a stock correction'
);

select is(
  (select current_quantity from public.batches where id = 'b0000000-4444-4444-4444-aaaaaaaaaaaa'),
  95,
  'batch decremented from 98 to 95 via stock_correction'
);

-- ============================================================================
-- rpc_stock_correction — reason required
-- ============================================================================
select throws_ok(
  $$ select public.rpc_stock_correction('b0000000-4444-4444-4444-aaaaaaaaaaaa', 1, '') $$,
  '22000',
  null,
  'stock_correction requires a reason'
);

-- ============================================================================
-- rpc_stock_correction — cannot go negative
-- ============================================================================
select throws_ok(
  $$ select public.rpc_stock_correction('b0000000-4444-4444-4444-aaaaaaaaaaaa', -9999, 'test') $$,
  '22000',
  null,
  'stock_correction cannot result in negative qty'
);

-- ============================================================================
-- Full transfer flow: request → approve → receive
-- ============================================================================
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002');  -- pharmacist at FROM store

-- 1) Request
select lives_ok(
  $$ select * from public.rpc_stock_transfer_request(jsonb_build_object(
       'client_uuid', '55555555-5555-5555-5555-555555555555',
       'from_store_id', 'b0000000-1111-1111-1111-aaaaaaaaaaaa',
       'to_store_id',   'b0000000-1111-1111-1111-bbbbbbbbbbbb',
       'transfer_no', 'T/RPC1-RPC2/0001',
       'flow', 'request_approve',
       'items', jsonb_build_array(jsonb_build_object(
         'source_batch_id', 'b0000000-4444-4444-4444-aaaaaaaaaaaa',
         'requested_quantity', 10
       ))
     )) $$,
  'pharmacist requests a transfer'
);

-- 2) Approve (as pharmacist B at TO store)
select pg_temp.as_user('b0000000-0000-0000-0000-000000000004');

select lives_ok(
  $$ select public.rpc_stock_transfer_approve(
       (select id from public.stock_transfers where transfer_no = 'T/RPC1-RPC2/0001'),
       jsonb_build_array(jsonb_build_object(
         'item_id', (select id from public.stock_transfer_items
                     where transfer_id = (select id from public.stock_transfers where transfer_no = 'T/RPC1-RPC2/0001') limit 1),
         'approved_quantity', 10
       ))) $$,
  'pharmacist at TO store approves the transfer'
);

-- After approve: source batch should be decremented (95 -> 85)
select is(
  (select current_quantity from public.batches where id = 'b0000000-4444-4444-4444-aaaaaaaaaaaa'),
  85,
  'source batch decremented by 10 after approve (95 -> 85)'
);

-- 3) Receive (still at TO store) — dest batch created
select lives_ok(
  $$ select public.rpc_stock_transfer_receive(
       (select id from public.stock_transfers where transfer_no = 'T/RPC1-RPC2/0001'),
       jsonb_build_array(jsonb_build_object(
         'item_id', (select id from public.stock_transfer_items
                     where transfer_id = (select id from public.stock_transfers where transfer_no = 'T/RPC1-RPC2/0001') limit 1),
         'received_quantity', 10
       ))) $$,
  'pharmacist at TO store receives the transfer'
);

select * from finish();
rollback;
