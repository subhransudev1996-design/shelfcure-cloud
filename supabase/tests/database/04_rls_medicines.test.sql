-- Tests: RLS on medicines under both shared-masters flag states.
-- Also covers dosage_forms (read-anyone) and medicine_categories.

begin;

select plan(13);

-- ============================================================================
-- Fixtures: two orgs, one with shared_masters enabled
-- ============================================================================

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role) values
  ('e1111111-1111-1111-1111-111111111111', 'mSuper@e.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('e2222222-2222-2222-2222-222222222222', 'mPharm@e.com', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
  ('f1111111-1111-1111-1111-111111111111', 'mF1@e.com',    '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

set local role postgres;

insert into public.organizations (id, name, shared_masters_enabled) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Org Echo (sharing on)', true),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Org Foxtrot (sharing off)', false);

insert into public.stores (id, org_id, code, name) values
  ('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'PUN01', 'Echo Pune'),
  ('eeee2222-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'PUN02', 'Echo Pune II'),
  ('ffff1111-ffff-ffff-ffff-ffffffffffff', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'KOL01', 'Foxtrot Kolkata');

insert into public.user_profiles (id, org_id, store_id, full_name, email, role) values
  ('e1111111-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,                                  'E Super',     'mSuper@e.com', 'super_admin'),
  ('e2222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','eeee1111-eeee-eeee-eeee-eeeeeeeeeeee','E Pharmacist','mPharm@e.com', 'pharmacist'),
  ('f1111111-1111-1111-1111-111111111111', 'ffffffff-ffff-ffff-ffff-ffffffffffff', null,                                  'F Super',     'mF1@e.com',    'super_admin');

-- Pick a real dosage_form id once (Tablet)
create or replace function pg_temp.tablet_form_id() returns uuid language sql stable as $$
  select id from public.dosage_forms where name = 'Tablet' limit 1
$$;

-- Seed: 2 medicines in Echo (one org-wide, one store-scoped to PUN01) + 1 in Foxtrot
insert into public.medicines (id, org_id, store_id, name, dosage_form_id, default_gst_rate) values
  ('11111111-1111-1111-1111-111111111100', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,                                   'Paracetamol 500',  pg_temp.tablet_form_id(), 12),
  ('11111111-1111-1111-1111-111111111101', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'PUN01 Special',    pg_temp.tablet_form_id(), 12),
  ('22222222-2222-2222-2222-222222222200', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'ffff1111-ffff-ffff-ffff-ffffffffffff', 'Foxtrot Med',      pg_temp.tablet_form_id(), 12);

-- Identity switcher
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- dosage_forms: every authenticated user can read
-- ============================================================================
select pg_temp.as_user('e2222222-2222-2222-2222-222222222222');

select ok(
  (select count(*)::int from public.dosage_forms) >= 30,
  'dosage_forms is readable and seeded (>= 30 rows)'
);

select throws_ok(
  $$ insert into public.dosage_forms (name, base_unit) values ('Hijack', 'unit') $$,
  '42501',
  null,
  'authenticated users cannot insert dosage_forms (system table)'
);

-- ============================================================================
-- Echo (shared_masters = true): pharmacist sees org-wide + own-store medicines
-- ============================================================================
select pg_temp.as_user('e2222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from public.medicines),
  2,
  'Echo pharmacist (shared on) sees the org-wide + own-store medicines (2)'
);

select ok(
  exists(select 1 from public.medicines where name = 'Paracetamol 500'),
  'pharmacist sees the org-wide medicine via shared_masters'
);

select ok(
  exists(select 1 from public.medicines where name = 'PUN01 Special'),
  'pharmacist sees own-store medicine'
);

select ok(
  not exists(select 1 from public.medicines where name = 'Foxtrot Med'),
  'pharmacist cannot see another org''s medicine'
);

-- Pharmacist inserts a store-scoped medicine
select lives_ok(
  $$ insert into public.medicines (org_id, store_id, name, dosage_form_id) values
       ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
        'Crocin 650', pg_temp.tablet_form_id()) $$,
  'pharmacist can insert a medicine into their own store'
);

-- Pharmacist cannot insert an org-wide medicine (store_id null)
select throws_ok(
  $$ insert into public.medicines (org_id, store_id, name, dosage_form_id) values
       ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,
        'Should fail', pg_temp.tablet_form_id()) $$,
  '42501',
  null,
  'pharmacist cannot insert an org-wide (store_id NULL) medicine'
);

-- Pharmacist cannot insert into a different store
select throws_ok(
  $$ insert into public.medicines (org_id, store_id, name, dosage_form_id) values
       ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
        'Wrong store', pg_temp.tablet_form_id()) $$,
  '42501',
  null,
  'pharmacist cannot insert into another store in their org'
);

-- ============================================================================
-- Echo super_admin can insert org-wide
-- ============================================================================
select pg_temp.as_user('e1111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ insert into public.medicines (org_id, store_id, name, dosage_form_id) values
       ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,
        'Echo Org-wide New', pg_temp.tablet_form_id()) $$,
  'super_admin can insert an org-wide medicine'
);

select is(
  (select count(*)::int from public.medicines),
  4,
  'Echo super_admin sees all 4 medicines (3 org-wide + 1 store-scoped)'
);

-- ============================================================================
-- Foxtrot (shared_masters = false): no org-wide visibility
-- ============================================================================
select pg_temp.as_user('f1111111-1111-1111-1111-111111111111');

-- Foxtrot has no org-wide rows, only the one store-scoped 'Foxtrot Med'.
-- super_admin always sees org-wide-scoped rows in their org (none exist) plus all store-scoped.
select is(
  (select count(*)::int from public.medicines),
  1,
  'Foxtrot super_admin sees only their org''s 1 store-scoped medicine'
);

select ok(
  not exists(select 1 from public.medicines where name = 'Paracetamol 500'),
  'Foxtrot super_admin cannot see Echo''s org-wide medicine (cross-org isolation)'
);

select * from finish();
rollback;
