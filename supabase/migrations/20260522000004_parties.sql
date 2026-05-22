-- ShelfCure Cloud — Migration 0004
-- Parties (Phase 1 slice 3): suppliers, customers, doctors + related.
--
-- All three are master entities referenced by purchases, sales, prescriptions.
-- Tenancy follows the medicines pattern (ADR-0002):
--   - org_id mandatory
--   - store_id nullable: null = org-wide (only visible when shared_masters_enabled)
--   - store_id set = scoped to that store
--
-- Maps desktop migrations 001 (suppliers, customers), 019 + 042 + 043
-- (customer_regular_medicines, refill schedule, special discount), 038 + 039
-- (doctors, doctor_commission_payouts).

-- ============================================================================
-- suppliers
-- ============================================================================

create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid references public.stores(id) on delete restrict,
  name                text not null check (length(trim(name)) between 1 and 200),
  gstin               text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  address             text,
  city                text,
  state               text,
  pincode             text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  phone               text,
  email               text,
  contact_person      text,
  credit_limit        numeric(12,2),
  credit_days         integer check (credit_days is null or credit_days >= 0),
  outstanding_balance numeric(12,2) not null default 0,
  opening_balance     numeric(12,2) not null default 0,
  is_active           boolean not null default true,
  version             integer not null default 1,
  updated_by          uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.suppliers is 'Pharmacy suppliers/distributors. Org-scoped with optional per-store override.';

create index suppliers_org_idx on public.suppliers (org_id) where deleted_at is null and is_active;
create index suppliers_store_idx on public.suppliers (store_id) where store_id is not null and deleted_at is null;
create index suppliers_name_trgm_idx on public.suppliers using gin (name extensions.gin_trgm_ops);

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.tg_set_updated_at();

-- Backfill FK on batches.supplier_id (added column in slice 2 without FK).
alter table public.batches
  add constraint batches_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id) on delete set null;

-- ============================================================================
-- customers
-- ============================================================================

create table public.customers (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete restrict,
  store_id                 uuid references public.stores(id) on delete restrict,
  name                     text not null check (length(trim(name)) between 1 and 200),
  phone                    text not null default '',
  email                    text,
  address                  text,
  gstin                    text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  state                    text,
  customer_type            text not null default 'b2c' check (customer_type in ('b2c','b2b')),
  credit_limit             numeric(12,2),
  credit_days              integer check (credit_days is null or credit_days >= 0),
  outstanding_balance      numeric(12,2) not null default 0,
  total_purchases          numeric(14,2) not null default 0,
  last_purchase_date       date,
  -- Per-customer special discount (ADR not specific; mirror desktop migration 043).
  special_discount_type    text check (special_discount_type is null or special_discount_type in ('percentage','flat')),
  special_discount_value   numeric(10,2) not null default 0 check (special_discount_value >= 0),
  special_discount_label   text,
  is_active                boolean not null default true,
  version                  integer not null default 1,
  updated_by               uuid references public.user_profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

comment on table public.customers is 'Pharmacy customers (B2C walk-ins or B2B accounts). Org-scoped with optional per-store override.';

create index customers_org_idx on public.customers (org_id) where deleted_at is null and is_active;
create index customers_store_idx on public.customers (store_id) where store_id is not null and deleted_at is null;
create index customers_phone_idx on public.customers (org_id, phone) where deleted_at is null;
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- customer_regular_medicines — refill schedules (per customer + medicine)
-- ============================================================================

create table public.customer_regular_medicines (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete restrict,
  customer_id          uuid not null references public.customers(id) on delete cascade,
  medicine_id          uuid not null references public.medicines(id) on delete cascade,
  interval_days        integer check (interval_days is null or interval_days > 0),
  remind_days_before   integer not null default 3 check (remind_days_before >= 0),
  last_dispensed_date  date,
  next_due_date        date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (customer_id, medicine_id)
);

comment on table public.customer_regular_medicines is
  'Per-customer medicine refill schedule. Powers daily refill reminders on the dashboard.';

create index crm_next_due_idx on public.customer_regular_medicines (next_due_date) where next_due_date is not null;
create index crm_customer_idx on public.customer_regular_medicines (customer_id);
create index crm_medicine_idx on public.customer_regular_medicines (medicine_id);

create trigger trg_crm_updated_at
  before update on public.customer_regular_medicines
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- doctors
-- ============================================================================

create table public.doctors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid references public.stores(id) on delete restrict,
  name            text not null check (length(trim(name)) between 1 and 200),
  specialization  text,
  phone           text,
  clinic_name     text,
  clinic_address  text,
  -- Commission config (mirrors desktop migration 039)
  commission_type text not null default 'percentage' check (commission_type in ('percentage','fixed')),
  commission_rate numeric(10,2) not null default 0 check (commission_rate >= 0),
  notes           text,
  is_active       boolean not null default true,
  version         integer not null default 1,
  updated_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.doctors is 'Prescribing doctors. Org-scoped with optional per-store override.';

create index doctors_org_idx on public.doctors (org_id) where deleted_at is null and is_active;
create index doctors_store_idx on public.doctors (store_id) where store_id is not null and deleted_at is null;
create index doctors_name_trgm_idx on public.doctors using gin (name extensions.gin_trgm_ops);

create trigger trg_doctors_updated_at
  before update on public.doctors
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- doctor_commission_payouts — store-scoped financial events
-- ============================================================================

create table public.doctor_commission_payouts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  store_id    uuid not null references public.stores(id) on delete restrict,
  doctor_id   uuid not null references public.doctors(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  notes       text,
  paid_at     timestamptz not null default now(),
  paid_by     uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.doctor_commission_payouts is
  'Records of commission payments to doctors. Always store-scoped (it is a real money movement at a specific store).';

create index dcp_store_paid_at_idx on public.doctor_commission_payouts (store_id, paid_at desc);
create index dcp_doctor_idx on public.doctor_commission_payouts (doctor_id);

-- ============================================================================
-- RLS — same pattern as medicines for the master tables
-- ============================================================================

-- suppliers
alter table public.suppliers enable row level security;

create policy suppliers_select on public.suppliers
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.current_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

create policy suppliers_insert on public.suppliers
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

create policy suppliers_update on public.suppliers
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

grant select, insert, update on public.suppliers to authenticated;

-- customers (same shape; cashier can also insert during a sale)
alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.current_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

create policy customers_insert on public.customers
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist','cashier'))
    )
  );

create policy customers_update on public.customers
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

grant select, insert, update on public.customers to authenticated;

-- customer_regular_medicines — inherits visibility from customer
alter table public.customer_regular_medicines enable row level security;

create policy crm_select on public.customer_regular_medicines
  for select using (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
  );

create policy crm_insert on public.customer_regular_medicines
  for insert with check (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

create policy crm_update on public.customer_regular_medicines
  for update using (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
  );

create policy crm_delete on public.customer_regular_medicines
  for delete using (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update, delete on public.customer_regular_medicines to authenticated;

-- doctors
alter table public.doctors enable row level security;

create policy doctors_select on public.doctors
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.current_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

create policy doctors_insert on public.doctors
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

create policy doctors_update on public.doctors
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.current_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.current_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

grant select, insert, update on public.doctors to authenticated;

-- doctor_commission_payouts: store-scoped, write by super_admin/store_admin only
alter table public.doctor_commission_payouts enable row level security;

create policy dcp_select on public.doctor_commission_payouts
  for select using (public.user_has_store_access(store_id));

create policy dcp_insert on public.doctor_commission_payouts
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin')
  );

grant select, insert on public.doctor_commission_payouts to authenticated;
