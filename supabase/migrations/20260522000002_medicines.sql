-- ShelfCure Cloud — Migration 0002
-- Medicines + categories + dosage_forms (Phase 1 vertical slice 1).
--
-- Maps the desktop schema (migrations 001, 011, 012, 013, 040) to multi-tenant Cloud:
--   - dosage_forms: global system table (no org_id), seeded with the same 32 forms.
--   - medicine_categories: org-scoped, optional per-store override.
--   - medicines: org-scoped, optional per-store override. Respects ADR-0002
--     (shared_masters_enabled flag on the org).

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;   -- fuzzy medicine name search

-- ============================================================================
-- dosage_forms — global system table
-- ============================================================================

create table public.dosage_forms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 1 and 60),
  base_unit   text not null check (length(trim(base_unit)) between 1 and 20),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.dosage_forms is
  'Global catalog of pharmaceutical dosage forms (Tablet, Capsule, Syrup, etc.). System-owned, not tenant-scoped.';

-- Seed (combined from desktop migrations 003, 014, 015, 016, 035).
insert into public.dosage_forms (name, base_unit, sort_order) values
  ('Tablet',          'tablet',  1),
  ('Capsule',         'capsule', 2),
  ('Tablet (SR)',     'tablet',  3),
  ('Capsule (SR)',    'capsule', 4),
  ('Syrup',           'ml',      5),
  ('Suspension',      'ml',      6),
  ('Solution',        'ml',      7),
  ('Drops',           'ml',      8),
  ('Liquid',          'ml',      9),
  ('Drink',           'ml',      10),
  ('Bottle',          'ml',      11),
  ('Injection',       'unit',    12),
  ('Vial',            'unit',    13),
  ('Ampoule',         'unit',    14),
  ('Respule',         'unit',    15),
  ('Inhaler',         'unit',    16),
  ('Spray',           'unit',    17),
  ('Patch',           'unit',    18),
  ('Suppository',     'unit',    19),
  ('Roll-On',         'unit',    20),
  ('Pad',             'unit',    21),
  ('Box',             'unit',    22),
  ('Cream',           'g',       23),
  ('Ointment',        'g',       24),
  ('Gel',             'g',       25),
  ('Powder',          'g',       26),
  ('Sachet',          'g',       27),
  ('Paste',           'g',       28),
  ('Lotion',          'ml',      29),
  ('Shampoo',         'ml',      30),
  ('Soap',            'unit',    31),
  ('Chocolate Jar',   'jar',     32);

-- ============================================================================
-- medicine_categories — org-scoped, optional per-store
-- ============================================================================

create table public.medicine_categories (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  store_id     uuid references public.stores(id) on delete restrict,
  name         text not null check (length(trim(name)) between 1 and 80),
  description  text,
  is_system    boolean not null default false,
  is_active    boolean not null default true,
  version      integer not null default 1,
  updated_by   uuid references public.user_profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, store_id, name)
);

comment on table public.medicine_categories is
  'Category labels for medicines. Org-scoped by default; per-store when store_id is set; org-wide when null (shared masters).';

create index medicine_categories_org_idx
  on public.medicine_categories (org_id) where deleted_at is null and is_active;

create index medicine_categories_store_idx
  on public.medicine_categories (store_id) where store_id is not null and deleted_at is null;

create trigger trg_medicine_categories_updated_at
  before update on public.medicine_categories
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- medicines — org-scoped, optional per-store
-- ============================================================================

create table public.medicines (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete restrict,
  store_id          uuid references public.stores(id) on delete restrict,
  name              text not null check (length(trim(name)) between 1 and 200),
  salt_composition  text,
  manufacturer      text not null default '',
  category_id       uuid references public.medicine_categories(id) on delete set null,
  dosage_form_id    uuid not null references public.dosage_forms(id),
  strength          text,
  pack_size         integer not null default 1 check (pack_size > 0),
  pack_unit         text not null default 'strip',
  units_per_pack    integer check (units_per_pack is null or units_per_pack > 0),
  sale_unit_mode    text not null default 'pack_only'
                    check (sale_unit_mode in ('individual','pack_only','both')),
  min_stock_level   integer not null default 10 check (min_stock_level >= 0),
  reorder_level     integer not null default 20 check (reorder_level >= 0),
  default_gst_rate  numeric(5,2) not null default 0 check (default_gst_rate >= 0 and default_gst_rate <= 100),
  hsn_code          text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  barcode           text,
  rack_location     text,
  is_favourite      boolean not null default false,
  is_focused        boolean not null default false,
  focus_label       text,
  scan_confidence   numeric(5,3) check (scan_confidence is null or (scan_confidence >= 0 and scan_confidence <= 1)),
  version           integer not null default 1,
  updated_by        uuid references public.user_profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.medicines is
  'Medicine master. Org-scoped by default. Per-store overrides supported via store_id; org-wide via store_id NULL (gated by organizations.shared_masters_enabled).';

create index medicines_org_idx
  on public.medicines (org_id) where deleted_at is null;

create index medicines_store_idx
  on public.medicines (store_id) where store_id is not null and deleted_at is null;

create index medicines_name_trgm_idx
  on public.medicines using gin (name extensions.gin_trgm_ops);

create index medicines_barcode_idx
  on public.medicines (org_id, barcode) where barcode is not null and deleted_at is null;

create index medicines_dosage_form_idx
  on public.medicines (dosage_form_id);

create trigger trg_medicines_updated_at
  before update on public.medicines
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- RLS helper: shared-masters check
-- ============================================================================

create or replace function public.user_org_has_shared_masters()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(o.shared_masters_enabled, false)
  from public.organizations o
  where o.id = public.current_org()
$$;

comment on function public.user_org_has_shared_masters() is
  'ADR-0002: true when the current user''s org has opted into org-wide shared masters.';

grant execute on function public.user_org_has_shared_masters() to authenticated;

-- ============================================================================
-- RLS policies
-- ============================================================================

-- dosage_forms: read-only for all authenticated users. Mutations via service_role only.
alter table public.dosage_forms enable row level security;

create policy dosage_forms_select on public.dosage_forms
  for select using (true);

grant select on public.dosage_forms to authenticated;

-- medicine_categories
alter table public.medicine_categories enable row level security;

create policy medicine_categories_select on public.medicine_categories
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.current_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

create policy medicine_categories_insert on public.medicine_categories
  for insert with check (
    org_id = public.current_org()
    and (
      -- Org-wide insert: super_admin only, and shared masters must be enabled OR caller is super_admin
      (store_id is null and public.current_role() = 'super_admin')
      or
      -- Store-scoped insert: caller writes to their store (or super_admin to any org store)
      (store_id is not null and public.user_has_store_access(store_id)
       and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

create policy medicine_categories_update on public.medicine_categories
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- No delete policy: soft-delete only via deleted_at.

grant select, insert, update on public.medicine_categories to authenticated;

-- medicines: same shape as categories
alter table public.medicines enable row level security;

create policy medicines_select on public.medicines
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.current_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

create policy medicines_insert on public.medicines
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

create policy medicines_update on public.medicines
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

grant select, insert, update on public.medicines to authenticated;
