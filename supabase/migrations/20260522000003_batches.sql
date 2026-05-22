-- ShelfCure Cloud — Migration 0003
-- Batches (Phase 1 slice 2).
--
-- A batch is a single manufacturing lot of a medicine with its own MRP,
-- expiry, and remaining quantity. Stock is tracked at the batch level — sales
-- decrement batches, purchases create or top them up.
--
-- Maps desktop migrations 001 (batches), 017 (supplier_id), 029 (barcode).
--
-- Tenancy: batches are ALWAYS store-scoped (stock is physical, never org-wide).
-- Even when medicines are shared org-wide via shared_masters, each store has
-- its own batches of that medicine.

create table public.batches (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  supplier_id         uuid,                              -- FK enforced in slice 3 once suppliers lands
  batch_number        text not null check (length(trim(batch_number)) between 1 and 60),
  expiry_date         date not null,
  initial_quantity    integer not null default 0 check (initial_quantity >= 0),
  current_quantity    integer not null default 0 check (current_quantity >= 0),
  purchase_rate       numeric(12,2) not null default 0 check (purchase_rate >= 0),
  mrp                 numeric(12,2) not null default 0 check (mrp >= 0),
  selling_price       numeric(12,2) check (selling_price is null or selling_price >= 0),
  gst_percentage      numeric(5,2) not null default 0 check (gst_percentage >= 0 and gst_percentage <= 100),
  barcode             text,
  is_blocked          boolean not null default false,
  version             integer not null default 1,
  updated_by          uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  -- The same medicine can have many batches with the same batch_number across
  -- different stores; uniqueness is per-store.
  unique (store_id, medicine_id, batch_number)
);

comment on table public.batches is
  'Stock buckets. Each batch is a manufacturing lot with its own MRP, expiry, and on-hand quantity. Store-scoped — stock is physical.';
comment on column public.batches.current_quantity is
  'Units remaining. Decremented on sale, incremented on purchase or stock-correction.';

-- Indexes per IMPL §5.4
create index batches_store_med_expiry_idx
  on public.batches (store_id, medicine_id, expiry_date)
  where deleted_at is null;

create index batches_store_expiry_idx
  on public.batches (store_id, expiry_date)
  where current_quantity > 0 and deleted_at is null;

create index batches_barcode_idx
  on public.batches (store_id, barcode)
  where barcode is not null and deleted_at is null;

create trigger trg_batches_updated_at
  before update on public.batches
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.batches enable row level security;

create policy batches_select on public.batches
  for select using (public.user_has_store_access(store_id));

create policy batches_insert on public.batches
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy batches_update on public.batches
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

-- No delete policy: soft-delete via deleted_at only.

grant select, insert, update on public.batches to authenticated;
