-- Tests: RLS on batches. Stock is physical = always store-scoped, never org-wide.

begin;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('a1111111-aaaa-bbbb-cccc-100000000001', 'bSuper@t.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a1111111-aaaa-bbbb-cccc-100000000002', 'bPharm1@t.com','{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a1111111-aaaa-bbbb-cccc-100000000003', 'bPharm2@t.com','{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('a1111111-aaaa-bbbb-cccc-100000000004', 'bCash@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('a1110000-0000-0000-0000-000000000001', 'Org Batch-Alpha');

insert into public.stores (id, org_id, code, name) values
  ('a1110000-0000-0000-0000-000000000a01', 'a1110000-0000-0000-0000-000000000001', 'BTS01', 'Batch Store 1'),
  ('a1110000-0000-0000-0000-000000000a02', 'a1110000-0000-0000-0000-000000000001', 'BTS02', 'Batch Store 2');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('a1111111-aaaa-bbbb-cccc-100000000001', 'a1110000-0000-0000-0000-000000000001', null,                                     'B Super',    'bSuper@t.com',  'super_admin'),
  ('a1111111-aaaa-bbbb-cccc-100000000002', 'a1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000a01',   'B Pharm-1',  'bPharm1@t.com', 'pharmacist'),
  ('a1111111-aaaa-bbbb-cccc-100000000003', 'a1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000a02',   'B Pharm-2',  'bPharm2@t.com', 'pharmacist'),
  ('a1111111-aaaa-bbbb-cccc-100000000004', 'a1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000a01',   'B Cashier',  'bCash@t.com',   'cashier');

-- Need a medicine for batches to reference
insert into public.medicines (id, org_id, store_id, name, dosage_form_id) values
  ('a1110000-1111-1111-1111-000000000001',
   'a1110000-0000-0000-0000-000000000001',
   'a1110000-0000-0000-0000-000000000a01',
   'Paracetamol Test',
   (select id from public.dosage_forms where name = 'Tablet' limit 1));

-- Seed batches: one in each store
insert into public.batches (id, org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage) values
  ('a1110000-2222-2222-2222-000000000001', 'a1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000a01', 'a1110000-1111-1111-1111-000000000001', 'B001', '2027-12-31', 100, 50, 12),
  ('a1110000-2222-2222-2222-000000000002', 'a1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000a02', 'a1110000-1111-1111-1111-000000000001', 'B002', '2027-12-31', 50,  50, 12);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Pharmacist of BTS01 sees only their store's batch
-- ----------------------------------------------------------------------------
select pg_temp.as_user('a1111111-aaaa-bbbb-cccc-100000000002');

select is((select count(*)::int from public.batches), 1, 'BTS01 pharmacist sees 1 batch (their store only)');
select is((select batch_number from public.batches limit 1), 'B001', 'BTS01 pharmacist sees the correct batch');

-- Insert into own store: OK
select lives_ok(
  $$ insert into public.batches (org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage)
     values ('a1110000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000a01','a1110000-1111-1111-1111-000000000001','B003','2027-06-30',25,55,12) $$,
  'pharmacist can insert a batch into their own store'
);

-- Insert into another store: denied
select throws_ok(
  $$ insert into public.batches (org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage)
     values ('a1110000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000a02','a1110000-1111-1111-1111-000000000001','B004','2027-06-30',25,55,12) $$,
  '42501',
  null,
  'pharmacist cannot insert a batch into another store in the same org'
);

-- ----------------------------------------------------------------------------
-- Cashier: read-only on batches
-- ----------------------------------------------------------------------------
select pg_temp.as_user('a1111111-aaaa-bbbb-cccc-100000000004');

select is((select count(*)::int from public.batches), 2, 'cashier of BTS01 sees their store''s batches (including the one pharmacist added)');

select throws_ok(
  $$ insert into public.batches (org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage)
     values ('a1110000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000a01','a1110000-1111-1111-1111-000000000001','B005','2027-06-30',25,55,12) $$,
  '42501',
  null,
  'cashier cannot insert batches (read-only on stock)'
);

-- ----------------------------------------------------------------------------
-- Super admin: org-wide view
-- ----------------------------------------------------------------------------
select pg_temp.as_user('a1111111-aaaa-bbbb-cccc-100000000001');

select is((select count(*)::int from public.batches), 3, 'super_admin sees all batches across the org (both stores)');

select * from finish();
rollback;
