-- ShelfCure Cloud — Migration 0008
-- Inter-store stock transfers (Phase 1 slice 7).
--
-- Two flows per ADR §7.6:
--   1) Immediate transfer (super_admin only): one-step move; status = received on commit.
--   2) Request → Approve workflow: Store A requests, Store B reviews, Store A ships,
--      Store B receives. States: requested → approved → in_transit → received (or
--      rejected/cancelled).
--
-- Schema preserved from IMPL §5.3.

-- ============================================================================
-- stock_transfers — transfer header
-- ============================================================================

create table public.stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  from_store_id   uuid not null references public.stores(id) on delete restrict,
  to_store_id     uuid not null references public.stores(id) on delete restrict,
  transfer_no     text not null check (length(trim(transfer_no)) between 1 and 60),
  flow            text not null check (flow in ('immediate','request_approve')),
  status          text not null default 'requested'
                  check (status in ('requested','approved','rejected','in_transit','received','cancelled')),
  requested_by    uuid references public.user_profiles(id),
  approved_by     uuid references public.user_profiles(id),
  shipped_by      uuid references public.user_profiles(id),
  received_by     uuid references public.user_profiles(id),
  notes           text,
  client_uuid     uuid not null default gen_random_uuid(),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  approved_at     timestamptz,
  shipped_at      timestamptz,
  received_at     timestamptz,
  cancelled_at    timestamptz,
  rejected_at     timestamptz,

  unique (org_id, transfer_no),
  unique (client_uuid),
  -- Same store can't transfer to itself
  constraint stock_transfers_distinct_stores check (from_store_id <> to_store_id)
);

comment on table public.stock_transfers is
  'Inter-store stock movements. Immediate flow = super_admin one-step. Request/Approve flow = state machine across both stores.';

create index stock_transfers_from_idx on public.stock_transfers (from_store_id, status, created_at desc);
create index stock_transfers_to_idx on public.stock_transfers (to_store_id, status, created_at desc);
create index stock_transfers_org_status_idx on public.stock_transfers (org_id, status);

create trigger trg_stock_transfers_updated_at
  before update on public.stock_transfers
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- stock_transfer_items
-- ============================================================================

create table public.stock_transfer_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  transfer_id         uuid not null references public.stock_transfers(id) on delete cascade,
  source_batch_id     uuid not null references public.batches(id) on delete restrict,
  medicine_id         uuid not null references public.medicines(id) on delete restrict,
  -- Denormalised so the receiving store knows what it's getting before stock arrives
  medicine_name       text not null,
  batch_number        text not null,
  expiry_date         date not null,
  -- Quantities flow: requested → (approved) → (received)
  requested_quantity  integer not null check (requested_quantity > 0),
  approved_quantity   integer check (approved_quantity is null or approved_quantity >= 0),
  received_quantity   integer check (received_quantity is null or received_quantity >= 0),
  -- Created at destination on receipt
  dest_batch_id       uuid references public.batches(id) on delete set null,
  mrp                 numeric(12,2) not null,
  purchase_rate       numeric(12,2) not null,
  gst_percentage      numeric(5,2) not null default 0,
  notes               text,
  created_at          timestamptz not null default now()
);

create index sti_transfer_idx on public.stock_transfer_items (transfer_id);
create index sti_source_batch_idx on public.stock_transfer_items (source_batch_id);

-- ============================================================================
-- RLS
--
-- A user can SEE a transfer if they have access to either side (from or to store).
-- INSERT: pharmacist+ at the from-store can request; super_admin can do immediate.
-- UPDATE: state transitions are scoped to whichever side the action belongs to —
-- approve/reject by to-store, ship by from-store, receive by to-store. Enforced
-- in RPCs (slice 8); RLS here is the coarse gate.
-- ============================================================================

alter table public.stock_transfers enable row level security;

create policy st_select on public.stock_transfers
  for select using (
    public.user_has_store_access(from_store_id)
    or public.user_has_store_access(to_store_id)
  );

create policy st_insert on public.stock_transfers
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(from_store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
    -- immediate flow requires super_admin
    and (flow <> 'immediate' or public.current_role() = 'super_admin')
  );

create policy st_update on public.stock_transfers
  for update using (
    (public.user_has_store_access(from_store_id) or public.user_has_store_access(to_store_id))
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.stock_transfers to authenticated;

alter table public.stock_transfer_items enable row level security;

create policy sti_select on public.stock_transfer_items
  for select using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = transfer_id
        and (public.user_has_store_access(t.from_store_id) or public.user_has_store_access(t.to_store_id))
    )
  );

create policy sti_insert on public.stock_transfer_items
  for insert with check (
    exists (
      select 1 from public.stock_transfers t
      where t.id = transfer_id
        and public.user_has_store_access(t.from_store_id)
    )
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy sti_update on public.stock_transfer_items
  for update using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = transfer_id
        and (public.user_has_store_access(t.from_store_id) or public.user_has_store_access(t.to_store_id))
    )
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert, update on public.stock_transfer_items to authenticated;
