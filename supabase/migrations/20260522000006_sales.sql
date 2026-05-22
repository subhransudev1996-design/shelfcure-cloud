-- ShelfCure Cloud — Migration 0006
-- Sales (Phase 1 slice 5): the heart of the POS.
-- sales, sale_items, sale_payments, sale_returns, sale_return_items.
--
-- All store-scoped. Sales decrement batch stock; returns put it back.
-- Once committed, sales are immutable EXCEPT through controlled modification
-- flow (is_modified flag + audit trail) per desktop migration 028.
--
-- Maps desktop migrations 001 (sales + sale_items), 005/007/008 (sale_returns),
-- 023/024 (sale_payments split), 025 (item discount), 026/027 (misc items),
-- 028 (modifications), 030 (history index), 037 (source), 038/039 (doctor),
-- 041 (round_off), 043 (special discount on sale).

-- ============================================================================
-- sales — bill header
-- ============================================================================

create table public.sales (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete restrict,
  store_id                 uuid not null references public.stores(id) on delete restrict,
  customer_id              uuid references public.customers(id) on delete restrict,
  doctor_id                uuid references public.doctors(id) on delete set null,
  bill_number              text not null check (length(trim(bill_number)) between 1 and 60),
  bill_date                date not null,
  -- Totals
  subtotal                 numeric(14,2) not null default 0 check (subtotal >= 0),
  taxable_amount           numeric(14,2) not null default 0 check (taxable_amount >= 0),
  gst_amount               numeric(14,2) not null default 0 check (gst_amount >= 0),
  cgst_amount              numeric(14,2) not null default 0,
  sgst_amount              numeric(14,2) not null default 0,
  igst_amount              numeric(14,2) not null default 0,
  discount_amount          numeric(14,2) default 0,
  -- Per-customer special discount (desktop migration 043)
  special_discount_amount  numeric(14,2) not null default 0,
  special_discount_label   text,
  misc_charge              numeric(14,2) default 0,
  round_off                numeric(6,2) not null default 0,
  total_amount             numeric(14,2) not null default 0 check (total_amount >= 0),
  -- Customer denormalization (printed on bill)
  customer_type            text not null default 'b2c' check (customer_type in ('b2c','b2b')),
  customer_gstin           text,
  customer_state           text,
  -- Doctor denormalization (when no FK; e.g. handwritten prescription)
  doctor_name              text,
  prescription_image_path  text,
  is_prescription_sale     boolean not null default false,
  -- Payment summary (legacy single field; split breakdown lives in sale_payments)
  payment_method           text not null default 'cash',
  payment_status           text not null default 'paid' check (payment_status in ('paid','partial','pending','credit')),
  paid_amount              numeric(14,2) not null default 0 check (paid_amount >= 0),
  -- Lifecycle flags
  is_returned              boolean not null default false,
  is_fully_returned        boolean not null default false,
  is_modified              boolean not null default false,
  modification_note        text,
  modified_at              timestamptz,
  -- Origin tracking (which app/terminal committed)
  source                   text not null default 'web' check (source in ('web','desktop','mobile','api')),
  -- Offline-first idempotency
  client_uuid              uuid not null default gen_random_uuid(),
  notes                    text,
  version                  integer not null default 1,
  created_by               uuid references public.user_profiles(id),
  updated_by               uuid references public.user_profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,

  unique (store_id, bill_number),
  unique (client_uuid)
);

comment on table public.sales is
  'Sale bill header. Per-store unique bill_number. client_uuid ensures idempotency under network retry (POS offline-first).';

-- Indexes per IMPL §5.4
create index sales_history_idx
  on public.sales (store_id, bill_date desc, id desc)
  where deleted_at is null;

create index sales_customer_idx
  on public.sales (customer_id)
  where customer_id is not null and deleted_at is null;

create index sales_payment_status_idx
  on public.sales (store_id, payment_status, bill_date desc)
  where deleted_at is null;

create index sales_doctor_idx
  on public.sales (doctor_id)
  where doctor_id is not null;

create trigger trg_sales_updated_at
  before update on public.sales
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- sale_items — line items (medicine_id + batch_id nullable for misc charges)
-- ============================================================================

create table public.sale_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  sale_id             uuid not null references public.sales(id) on delete cascade,
  medicine_id         uuid references public.medicines(id) on delete restrict,
  batch_id            uuid references public.batches(id) on delete restrict,
  quantity            integer not null default 0,
  selling_unit        text not null default 'pack' check (selling_unit in ('pack','unit')),
  mrp                 numeric(12,2) not null default 0,
  discount_percentage numeric(5,2),
  item_discount_type  text check (item_discount_type is null or item_discount_type in ('percentage','flat')),
  item_discount_value numeric(10,2),
  gst_percentage      numeric(5,2) not null default 0,
  taxable_amount      numeric(14,2) not null default 0,
  cgst_percentage     numeric(5,2) not null default 0,
  sgst_percentage     numeric(5,2) not null default 0,
  igst_percentage     numeric(5,2) not null default 0,
  cgst_amount         numeric(14,2) not null default 0,
  sgst_amount         numeric(14,2) not null default 0,
  igst_amount         numeric(14,2) not null default 0,
  amount              numeric(14,2) not null default 0,
  returned_quantity   integer not null default 0 check (returned_quantity >= 0),
  -- Modification audit (desktop migration 028)
  is_modified_item    boolean not null default false,
  original_quantity   integer,
  -- Misc/note item (no medicine/batch, free-form charge)
  is_misc_item        boolean not null default false,
  misc_note           text,
  created_at          timestamptz not null default now(),

  -- Misc items must NOT have medicine/batch; regular items MUST have both.
  constraint sale_items_misc_consistency check (
    (is_misc_item = true and medicine_id is null and batch_id is null)
    or (is_misc_item = false and medicine_id is not null and batch_id is not null)
  )
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_batch_idx on public.sale_items (batch_id) where batch_id is not null;
create index sale_items_medicine_idx on public.sale_items (medicine_id) where medicine_id is not null;

-- ============================================================================
-- sale_payments — split payments (cash + UPI + card on same bill, etc.)
-- ============================================================================

create table public.sale_payments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  store_id         uuid not null references public.stores(id) on delete restrict,
  sale_id          uuid not null references public.sales(id) on delete cascade,
  payment_method   text not null check (payment_method in ('cash','card','upi','wallet','credit','bank_transfer','cheque','other')),
  amount           numeric(14,2) not null check (amount > 0),
  reference_number text,
  paid_at          timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index sale_payments_sale_idx on public.sale_payments (sale_id);
create index sale_payments_store_method_idx on public.sale_payments (store_id, payment_method, paid_at);

-- ============================================================================
-- sale_returns + items
-- ============================================================================

create table public.sale_returns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  sale_id         uuid not null references public.sales(id) on delete restrict,
  customer_id     uuid references public.customers(id) on delete set null,
  return_number   text not null check (length(trim(return_number)) between 1 and 60),
  return_date     date not null,
  subtotal        numeric(14,2) not null default 0,
  gst_amount      numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,
  reason          text,
  refund_method   text not null default 'cash' check (refund_method in ('cash','card','upi','wallet','credit_note','bank_transfer','other')),
  client_uuid     uuid not null default gen_random_uuid(),
  version         integer not null default 1,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (store_id, return_number),
  unique (client_uuid)
);

comment on table public.sale_returns is
  'Customer returns. Always tied to a source sale. Refund method captured for ledger.';

create index sale_returns_store_date_idx on public.sale_returns (store_id, return_date desc) where deleted_at is null;
create index sale_returns_sale_idx on public.sale_returns (sale_id);

create trigger trg_sale_returns_updated_at
  before update on public.sale_returns
  for each row execute function public.tg_set_updated_at();

create table public.sale_return_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  store_id         uuid not null references public.stores(id) on delete restrict,
  sale_return_id   uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id     uuid not null references public.sale_items(id) on delete restrict,
  medicine_id      uuid not null references public.medicines(id) on delete restrict,
  batch_id         uuid not null references public.batches(id) on delete restrict,
  quantity         integer not null default 0 check (quantity > 0),
  amount           numeric(14,2) not null default 0,
  created_at       timestamptz not null default now()
);

create index sri_return_idx on public.sale_return_items (sale_return_id);
create index sri_batch_idx on public.sale_return_items (batch_id);

-- ============================================================================
-- RLS — store-scoped reads/writes. Cashier can CREATE sales (POS flow) and
-- CREATE sale_returns. Cashier CANNOT update or delete after creation.
-- Modifications go through pharmacist+ via the modify flow (Phase 2).
-- ============================================================================

-- sales
alter table public.sales enable row level security;

create policy sales_select on public.sales
  for select using (public.user_has_store_access(store_id));

create policy sales_insert on public.sales
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

create policy sales_update on public.sales
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.sales to authenticated;

-- sale_items inherit sales
alter table public.sale_items enable row level security;

create policy sale_items_select on public.sale_items
  for select using (public.user_has_store_access(store_id));

create policy sale_items_insert on public.sale_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

create policy sale_items_update on public.sale_items
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.sale_items to authenticated;

-- sale_payments
alter table public.sale_payments enable row level security;

create policy sale_payments_select on public.sale_payments
  for select using (public.user_has_store_access(store_id));

create policy sale_payments_insert on public.sale_payments
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

grant select, insert on public.sale_payments to authenticated;

-- sale_returns: cashier can create (refund flow at POS); only pharmacist+ updates
alter table public.sale_returns enable row level security;

create policy sale_returns_select on public.sale_returns
  for select using (public.user_has_store_access(store_id));

create policy sale_returns_insert on public.sale_returns
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

create policy sale_returns_update on public.sale_returns
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.sale_returns to authenticated;

alter table public.sale_return_items enable row level security;

create policy sri_select on public.sale_return_items
  for select using (public.user_has_store_access(store_id));

create policy sri_insert on public.sale_return_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

grant select, insert on public.sale_return_items to authenticated;
