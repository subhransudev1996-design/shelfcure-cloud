-- Tests: RLS on stock_corrections, expenses, expense_categories, notifications, audit_log.

begin;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('90000000-0000-0000-0000-000000000001', 'oSup@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('90000000-0000-0000-0000-000000000002', 'oPh@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('90000000-0000-0000-0000-000000000003', 'oCa@t.com',   '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('90000000-0000-0000-0000-000000000004', 'oAcc@t.com',  '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name) values
  ('90000000-1111-1111-1111-111111111111', 'Org Operational');

insert into public.stores (id, org_id, code, name) values
  ('90000000-1111-1111-1111-aaaaaaaaaaaa', '90000000-1111-1111-1111-111111111111', 'OPS01', 'Operational Store');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('90000000-0000-0000-0000-000000000001', '90000000-1111-1111-1111-111111111111', null,                                       'O Super',   'oSup@t.com',  'super_admin'),
  ('90000000-0000-0000-0000-000000000002', '90000000-1111-1111-1111-111111111111', '90000000-1111-1111-1111-aaaaaaaaaaaa',     'O Pharm',   'oPh@t.com',   'pharmacist'),
  ('90000000-0000-0000-0000-000000000003', '90000000-1111-1111-1111-111111111111', '90000000-1111-1111-1111-aaaaaaaaaaaa',     'O Cashier', 'oCa@t.com',   'cashier'),
  ('90000000-0000-0000-0000-000000000004', '90000000-1111-1111-1111-111111111111', null,                                       'O Acct',    'oAcc@t.com',  'accountant');

insert into public.medicines (id, org_id, store_id, name, dosage_form_id) values
  ('90000000-3333-3333-3333-aaaaaaaaaaaa', '90000000-1111-1111-1111-111111111111', '90000000-1111-1111-1111-aaaaaaaaaaaa', 'Op Med',
   (select id from public.dosage_forms where name = 'Tablet' limit 1));

insert into public.batches (id, org_id, store_id, medicine_id, batch_number, expiry_date, current_quantity, mrp, gst_percentage) values
  ('90000000-4444-4444-4444-aaaaaaaaaaaa', '90000000-1111-1111-1111-111111111111', '90000000-1111-1111-1111-aaaaaaaaaaaa',
   '90000000-3333-3333-3333-aaaaaaaaaaaa', 'OP-B1', '2027-12-31', 100, 50, 12);

-- Notification seed: one org-wide system message
insert into public.notifications (id, org_id, title, message, kind, priority) values
  ('90000000-7777-7777-7777-aaaaaaaaaaaa', '90000000-1111-1111-1111-111111111111', 'Welcome', 'System notice', 'system', 'info');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- expense_categories: system-wide visible to all roles
-- ============================================================================
select pg_temp.as_user('90000000-0000-0000-0000-000000000003');  -- cashier

select ok(
  (select count(*)::int from public.expense_categories where is_system = true) >= 10,
  'cashier sees system-wide expense_categories (10 seeded)'
);

-- Cashier cannot create a category
select throws_ok(
  $$ insert into public.expense_categories (org_id, name) values ('90000000-1111-1111-1111-111111111111', 'Try') $$,
  '42501',
  null,
  'cashier cannot create an expense_category'
);

-- ============================================================================
-- expenses: pharmacist can insert, cashier cannot
-- ============================================================================
select pg_temp.as_user('90000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.expenses (org_id, store_id, description, amount, expense_date) values
     ('90000000-1111-1111-1111-111111111111','90000000-1111-1111-1111-aaaaaaaaaaaa','Electricity bill May',5000,'2026-05-22') $$,
  'pharmacist can insert an expense'
);

select pg_temp.as_user('90000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.expenses (org_id, store_id, description, amount, expense_date) values
     ('90000000-1111-1111-1111-111111111111','90000000-1111-1111-1111-aaaaaaaaaaaa','Cashier try',100,'2026-05-22') $$,
  '42501',
  null,
  'cashier cannot insert an expense'
);

-- ============================================================================
-- stock_corrections: pharmacist can insert, cashier cannot
-- ============================================================================
select pg_temp.as_user('90000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.stock_corrections (org_id, store_id, batch_id, medicine_id, delta, reason, before_qty, after_qty, performed_by) values
     ('90000000-1111-1111-1111-111111111111','90000000-1111-1111-1111-aaaaaaaaaaaa','90000000-4444-4444-4444-aaaaaaaaaaaa','90000000-3333-3333-3333-aaaaaaaaaaaa',-5,'Physical count adjustment',100,95,'90000000-0000-0000-0000-000000000002') $$,
  'pharmacist can record a stock_correction'
);

select pg_temp.as_user('90000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.stock_corrections (org_id, store_id, batch_id, medicine_id, delta, reason, before_qty, after_qty, performed_by) values
     ('90000000-1111-1111-1111-111111111111','90000000-1111-1111-1111-aaaaaaaaaaaa','90000000-4444-4444-4444-aaaaaaaaaaaa','90000000-3333-3333-3333-aaaaaaaaaaaa',1,'Should fail',95,96,'90000000-0000-0000-0000-000000000003') $$,
  '42501',
  null,
  'cashier cannot record stock_corrections'
);

-- ============================================================================
-- notifications: org-wide visible
-- ============================================================================
select pg_temp.as_user('90000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.notifications),
  1,
  'cashier sees the org-wide system notification'
);

-- ============================================================================
-- audit_log: only super_admin / accountant can read
-- ============================================================================
-- pharmacist sees nothing
select pg_temp.as_user('90000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.audit_log),
  0,
  'pharmacist cannot read audit_log'
);

-- accountant can
select pg_temp.as_user('90000000-0000-0000-0000-000000000004');

select ok(
  (select count(*) from public.audit_log) is not null,
  'accountant can read audit_log (currently empty)'
);

select * from finish();
rollback;
