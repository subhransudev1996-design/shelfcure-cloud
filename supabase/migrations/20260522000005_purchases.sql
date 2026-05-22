-- ShelfCure Cloud — Migration 0005
-- Stock-inbound: purchases, purchase_items, purchase_returns, purchase_return_items,
-- purchase_orders, purchase_order_items, challans, challan_items (Phase 1 slice 4).
--
-- All store-scoped (stock is physical, lives at a specific store).
-- Purchases bring stock IN; returns send stock back to supplier.
-- Purchase orders are the planning step before a purchase.
-- Challans = goods on approval (provisional stock at the store, not yet bought).
--
-- Maps desktop migrations 001 (purchases, purchase_items), 006 + 009 + 010
-- (purchase_returns), 018 (purchase_orders), 021 + 022 (challans + provisional).

-- ============================================================================
-- purchases
-- ============================================================================

create table public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  supplier_id         uuid not null references public.suppliers(id) on delete restrict,
  bill_number         text not null check (length(trim(bill_number)) between 1 and 60),
  bill_date           date not null,
  bill_image_url      text,
  subtotal            numeric(14,2) not null default 0 check (subtotal >= 0),
  taxable_amount      numeric(14,2) not null default 0 check (taxable_amount >= 0),
  gst_amount          numeric(14,2) not null default 0 check (gst_amount >= 0),
  cgst_amount         numeric(14,2) not null default 0,
  sgst_amount         numeric(14,2) not null default 0,
  igst_amount         numeric(14,2) not null default 0,
  discount_amount     numeric(14,2) default 0,
  total_amount        numeric(14,2) not null default 0,
  payment_status      text not null default 'pending' check (payment_status in ('pending','partial','paid')),
  paid_amount         numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method      text,
  payment_date        date,
  is_ai_scanned       boolean not null default false,
  client_uuid         uuid not null default gen_random_uuid(),     -- idempotency for offline sync
  notes               text,
  version             integer not null default 1,
  created_by          uuid references public.user_profiles(id),
  updated_by          uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  unique (store_id, bill_number, supplier_id),
  unique (client_uuid)                                              -- idempotency
);

comment on table public.purchases is
  'Inbound stock invoices from suppliers. Store-scoped. client_uuid ensures idempotency for offline-first sync.';

create index purchases_store_date_idx on public.purchases (store_id, bill_date desc) where deleted_at is null;
create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchases_payment_status_idx on public.purchases (store_id, payment_status) where deleted_at is null;

create trigger trg_purchases_updated_at
  before update on public.purchases
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- purchase_items
-- ============================================================================

create table public.purchase_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  purchase_id         uuid not null references public.purchases(id) on delete cascade,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  batch_number        text not null,
  expiry_date         date not null,
  quantity            integer not null default 0 check (quantity >= 0),
  free_quantity       integer default 0 check (free_quantity is null or free_quantity >= 0),
  returned_quantity   integer not null default 0 check (returned_quantity >= 0),
  purchase_rate       numeric(12,2) not null default 0 check (purchase_rate >= 0),
  mrp                 numeric(12,2) not null default 0 check (mrp >= 0),
  selling_price       numeric(12,2),
  gst_percentage      numeric(5,2) not null default 0 check (gst_percentage >= 0 and gst_percentage <= 100),
  discount_percentage numeric(5,2),
  amount              numeric(14,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_medicine_idx on public.purchase_items (medicine_id);
create index purchase_items_store_idx on public.purchase_items (store_id);

-- Back-fill the deferred FK on batches.purchase_item_id.
alter table public.batches add column purchase_item_id uuid references public.purchase_items(id) on delete set null;

create index batches_purchase_item_idx on public.batches (purchase_item_id) where purchase_item_id is not null;

-- ============================================================================
-- purchase_returns + items
-- ============================================================================

create table public.purchase_returns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  purchase_id     uuid not null references public.purchases(id) on delete restrict,
  supplier_id     uuid not null references public.suppliers(id) on delete restrict,
  return_number   text not null check (length(trim(return_number)) between 1 and 60),
  return_date     date not null,
  subtotal        numeric(14,2) not null default 0,
  gst_amount      numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,
  reason          text,
  client_uuid     uuid not null default gen_random_uuid(),
  version         integer not null default 1,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (store_id, return_number),
  unique (client_uuid)
);

comment on table public.purchase_returns is 'Goods returned to supplier. Always tied to a source purchase.';

create index purchase_returns_store_date_idx on public.purchase_returns (store_id, return_date desc) where deleted_at is null;
create index purchase_returns_purchase_idx on public.purchase_returns (purchase_id);

create trigger trg_purchase_returns_updated_at
  before update on public.purchase_returns
  for each row execute function public.tg_set_updated_at();

create table public.purchase_return_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  purchase_return_id  uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_item_id    uuid not null references public.purchase_items(id) on delete restrict,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  batch_id            uuid not null references public.batches(id) on delete restrict,
  quantity            integer not null default 0 check (quantity > 0),
  amount              numeric(14,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index pri_return_idx on public.purchase_return_items (purchase_return_id);
create index pri_batch_idx on public.purchase_return_items (batch_id);

-- ============================================================================
-- purchase_orders + items
-- ============================================================================

create table public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  supplier_id         uuid not null references public.suppliers(id) on delete restrict,
  order_date          date not null default current_date,
  status              text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  linked_purchase_id  uuid references public.purchases(id) on delete set null,
  notes               text,
  version             integer not null default 1,
  created_by          uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.purchase_orders is 'Planned purchase. Becomes a real purchase when fulfilled.';

create index po_store_status_idx on public.purchase_orders (store_id, status, order_date desc);
create index po_supplier_idx on public.purchase_orders (supplier_id);

create trigger trg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.tg_set_updated_at();

create table public.purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  po_id               uuid not null references public.purchase_orders(id) on delete cascade,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  requested_quantity  integer not null default 1 check (requested_quantity > 0),
  created_at          timestamptz not null default now()
);

create index poi_po_idx on public.purchase_order_items (po_id);

-- ============================================================================
-- challans + items (goods on approval — provisional stock at store)
-- ============================================================================

create table public.challans (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete restrict,
  store_id              uuid not null references public.stores(id) on delete restrict,
  supplier_id           uuid not null references public.suppliers(id) on delete restrict,
  challan_number        text not null check (length(trim(challan_number)) between 1 and 60),
  challan_date          date not null,
  expected_return_date  date,
  status                text not null default 'pending'
                        check (status in ('pending','converted','partial_returned','returned','cancelled')),
  linked_purchase_id    uuid references public.purchases(id) on delete set null,
  total_items           integer not null default 0,
  total_quantity        integer not null default 0,
  notes                 text,
  version               integer not null default 1,
  created_by            uuid references public.user_profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (store_id, challan_number)
);

comment on table public.challans is
  'Goods received on approval. Items sit as provisional stock until challan is converted to a purchase or returned.';

create index challans_store_date_idx on public.challans (store_id, challan_date desc) where deleted_at is null;
create index challans_status_idx on public.challans (store_id, status) where deleted_at is null;

create trigger trg_challans_updated_at
  before update on public.challans
  for each row execute function public.tg_set_updated_at();

create table public.challan_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  store_id            uuid not null references public.stores(id) on delete restrict,
  challan_id          uuid not null references public.challans(id) on delete cascade,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  batch_number        text not null,
  expiry_date         date not null,
  received_quantity   integer not null default 0 check (received_quantity >= 0),
  accepted_quantity   integer not null default 0 check (accepted_quantity >= 0),
  returned_quantity   integer not null default 0 check (returned_quantity >= 0),
  purchase_rate       numeric(12,2) not null default 0,
  mrp                 numeric(12,2) not null default 0,
  gst_percentage      numeric(5,2) not null default 0,
  status              text not null default 'pending'
                      check (status in ('pending','accepted','returned')),
  created_at          timestamptz not null default now()
);

create index challan_items_challan_idx on public.challan_items (challan_id);
create index challan_items_medicine_idx on public.challan_items (medicine_id);

-- Provisional stock: batches.challan_id links provisional batches back to their challan.
alter table public.batches add column challan_id uuid references public.challans(id) on delete set null;
create index batches_challan_idx on public.batches (challan_id) where challan_id is not null;

-- ============================================================================
-- RLS — all stock-inbound tables are store-scoped
-- ============================================================================

-- Reusable role checks
-- super_admin / store_admin / pharmacist can write; cashier read-only; accountant read-only.

-- purchases
alter table public.purchases enable row level security;

create policy purchases_select on public.purchases
  for select using (public.user_has_store_access(store_id));

create policy purchases_insert on public.purchases
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy purchases_update on public.purchases
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.purchases to authenticated;

-- purchase_items inherit purchases' permissions
alter table public.purchase_items enable row level security;

create policy purchase_items_select on public.purchase_items
  for select using (public.user_has_store_access(store_id));

create policy purchase_items_insert on public.purchase_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy purchase_items_update on public.purchase_items
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.purchase_items to authenticated;

-- purchase_returns + items
alter table public.purchase_returns enable row level security;

create policy purchase_returns_select on public.purchase_returns
  for select using (public.user_has_store_access(store_id));

create policy purchase_returns_insert on public.purchase_returns
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy purchase_returns_update on public.purchase_returns
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.purchase_returns to authenticated;

alter table public.purchase_return_items enable row level security;

create policy pri_select on public.purchase_return_items
  for select using (public.user_has_store_access(store_id));

create policy pri_insert on public.purchase_return_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert on public.purchase_return_items to authenticated;

-- purchase_orders + items
alter table public.purchase_orders enable row level security;

create policy po_select on public.purchase_orders
  for select using (public.user_has_store_access(store_id));

create policy po_insert on public.purchase_orders
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy po_update on public.purchase_orders
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.purchase_orders to authenticated;

alter table public.purchase_order_items enable row level security;

create policy poi_select on public.purchase_order_items
  for select using (
    exists (select 1 from public.purchase_orders po where po.id = po_id and public.user_has_store_access(po.store_id))
  );

create policy poi_insert on public.purchase_order_items
  for insert with check (
    exists (select 1 from public.purchase_orders po where po.id = po_id and public.user_has_store_access(po.store_id))
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert on public.purchase_order_items to authenticated;

-- challans + items
alter table public.challans enable row level security;

create policy challans_select on public.challans
  for select using (public.user_has_store_access(store_id));

create policy challans_insert on public.challans
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy challans_update on public.challans
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.challans to authenticated;

alter table public.challan_items enable row level security;

create policy challan_items_select on public.challan_items
  for select using (public.user_has_store_access(store_id));

create policy challan_items_insert on public.challan_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy challan_items_update on public.challan_items
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.challan_items to authenticated;
