-- ShelfCure Cloud — Migration 0007
-- Operational support tables (Phase 1 slice 6):
--   - stock_corrections : audit trail for manual batch qty adjustments
--   - expense_categories : org-scoped + system-wide categories
--   - expenses           : day-to-day operational expenses
--   - notifications      : per-store inbox (low stock, expiry, etc.)
--   - audit_log          : partitioned monthly per ADR-0016
--
-- This slice adds the "supporting cast" — features the user rarely opens
-- directly but that keep the rest of the system trustworthy.

-- ============================================================================
-- stock_corrections — audit trail for batch qty changes outside sales/purchases
-- ============================================================================

create table public.stock_corrections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  store_id      uuid not null references public.stores(id) on delete restrict,
  batch_id      uuid not null references public.batches(id) on delete restrict,
  medicine_id   uuid not null references public.medicines(id) on delete restrict,
  delta         integer not null check (delta <> 0),
  reason        text not null check (length(trim(reason)) between 3 and 500),
  before_qty    integer not null check (before_qty >= 0),
  after_qty     integer not null check (after_qty >= 0),
  performed_by  uuid not null references public.user_profiles(id),
  client_uuid   uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  unique (client_uuid)
);

comment on table public.stock_corrections is
  'Every manual batch quantity change goes through here. Records the delta, the reason, and who did it.';

create index stock_corrections_store_date_idx on public.stock_corrections (store_id, created_at desc);
create index stock_corrections_batch_idx on public.stock_corrections (batch_id, created_at desc);
create index stock_corrections_medicine_idx on public.stock_corrections (medicine_id, created_at desc);

-- ============================================================================
-- expense_categories — system + org-scoped
-- ============================================================================

create table public.expense_categories (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete restrict,  -- null = system-wide
  name         text not null check (length(trim(name)) between 1 and 80),
  description  text,
  is_system    boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (org_id, name)
);

comment on table public.expense_categories is
  'Expense buckets (Rent, Salaries, Utilities, etc.). System-wide rows have org_id NULL; per-org rows extend them.';

create index expense_categories_org_idx on public.expense_categories (org_id) where is_active;

-- Seed common categories as system-wide
insert into public.expense_categories (name, description, is_system) values
  ('Rent',            'Shop rent / lease',                 true),
  ('Salaries',        'Staff salaries & wages',            true),
  ('Utilities',       'Electricity, water, internet',      true),
  ('Maintenance',     'Equipment repair, cleaning',        true),
  ('Marketing',       'Ads, banners, promotions',          true),
  ('Transport',       'Local conveyance, delivery costs',  true),
  ('Office Supplies', 'Stationery, packaging materials',   true),
  ('Bank Charges',    'POS fees, payment-gateway fees',    true),
  ('Taxes & Govt',    'Professional tax, license renewals',true),
  ('Miscellaneous',   'Uncategorized expenses',            true);

-- ============================================================================
-- expenses
-- ============================================================================

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  category_id     uuid references public.expense_categories(id) on delete set null,
  description     text not null check (length(trim(description)) between 1 and 300),
  amount          numeric(14,2) not null check (amount > 0),
  expense_date    date not null,
  payment_method  text check (payment_method is null or payment_method in ('cash','card','upi','bank_transfer','cheque','other')),
  notes           text,
  attachment_url  text,
  created_by      uuid references public.user_profiles(id),
  client_uuid     uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (client_uuid)
);

comment on table public.expenses is 'Day-to-day store expenses. Always store-scoped.';

create index expenses_store_date_idx on public.expenses (store_id, expense_date desc) where deleted_at is null;
create index expenses_category_idx on public.expenses (category_id) where deleted_at is null;

create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- notifications — store inbox
-- ============================================================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  store_id     uuid references public.stores(id) on delete restrict,         -- null = org-wide
  target_user_id uuid references public.user_profiles(id) on delete cascade, -- null = all users in scope
  title        text not null check (length(trim(title)) between 1 and 200),
  message      text not null,
  kind         text not null default 'info' check (kind in ('stock','expiry','credit','sales','transfer','system','info')),
  priority     text not null default 'info' check (priority in ('info','warning','critical','success')),
  is_read      boolean not null default false,
  read_at      timestamptz,
  action_url   text,
  created_at   timestamptz not null default now()
);

create index notifications_store_unread_idx
  on public.notifications (store_id, created_at desc)
  where is_read = false;

create index notifications_user_idx
  on public.notifications (target_user_id, created_at desc)
  where target_user_id is not null;

-- ============================================================================
-- audit_log — partitioned monthly (ADR-0016)
--
-- Range-partitioned by created_at. We pre-create 6 months ahead; the cron
-- function audit-log-monthly-partition (Phase 7) creates more on rolling basis.
-- Audit log rows are INSERT-ONLY — no updates, no deletes.
-- ============================================================================

create table public.audit_log (
  id            bigserial,
  org_id        uuid not null references public.organizations(id) on delete restrict,
  store_id      uuid references public.stores(id) on delete restrict,
  user_id       uuid references public.user_profiles(id) on delete set null,
  entity        text not null check (length(trim(entity)) between 1 and 80),
  entity_id     text not null,
  action        text not null check (action in ('insert','update','delete','restore','login','logout','export')),
  before        jsonb,
  after         jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  primary key (id, created_at)
)
partition by range (created_at);

comment on table public.audit_log is
  'ADR-0016: monthly-partitioned audit log. Insert-only, never updated or deleted. 7-year retention before archival.';

-- Indexes are created per-partition. Define the function so future partitions
-- can call it uniformly.
create or replace function public.create_audit_log_partition(p_month_start date)
returns void
language plpgsql
as $$
declare
  v_partition_name text;
  v_start text := to_char(p_month_start, 'YYYY-MM-DD');
  v_end   text := to_char(p_month_start + interval '1 month', 'YYYY-MM-DD');
begin
  v_partition_name := 'audit_log_' || to_char(p_month_start, 'YYYY_MM');

  execute format(
    'create table if not exists public.%I partition of public.audit_log
       for values from (%L) to (%L)',
    v_partition_name, v_start, v_end
  );

  execute format(
    'create index if not exists %I on public.%I (org_id, created_at desc)',
    v_partition_name || '_org_idx', v_partition_name
  );

  execute format(
    'create index if not exists %I on public.%I (entity, entity_id)',
    v_partition_name || '_entity_idx', v_partition_name
  );
end;
$$;

-- Default partition catches anything outside our range (alerts will fire if
-- it ever gets a row).
create table public.audit_log_default partition of public.audit_log default;

-- Seed 6 months of partitions starting from 2026-05
do $$
declare
  m date := date_trunc('month', '2026-05-01'::date)::date;
begin
  for i in 0..5 loop
    perform public.create_audit_log_partition((m + (i || ' months')::interval)::date);
  end loop;
end $$;

-- ============================================================================
-- RLS
-- ============================================================================

-- stock_corrections
alter table public.stock_corrections enable row level security;

create policy sc_select on public.stock_corrections
  for select using (public.user_has_store_access(store_id));

create policy sc_insert on public.stock_corrections
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

grant select, insert on public.stock_corrections to authenticated;

-- expense_categories: read-all-authenticated, write super_admin
alter table public.expense_categories enable row level security;

create policy ec_select on public.expense_categories
  for select using (
    org_id is null                                -- system-wide visible to everyone
    or org_id = public.current_org()
  );

create policy ec_insert on public.expense_categories
  for insert with check (
    is_system = false                              -- nobody can claim system rows
    and org_id = public.current_org()
    and public.current_role() = 'super_admin'
  );

grant select, insert on public.expense_categories to authenticated;

-- expenses
alter table public.expenses enable row level security;

create policy expenses_select on public.expenses
  for select using (public.user_has_store_access(store_id));

create policy expenses_insert on public.expenses
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin','pharmacist')
  );

create policy expenses_update on public.expenses
  for update using (
    public.user_has_store_access(store_id)
    and public.current_role() in ('super_admin','store_admin')
  );

grant select, insert, update on public.expenses to authenticated;

-- notifications
alter table public.notifications enable row level security;

create policy notif_select on public.notifications
  for select using (
    (target_user_id is null and (store_id is null or public.user_has_store_access(store_id))
     and (store_id is null or true))
    or target_user_id = auth.uid()
  );

create policy notif_update on public.notifications
  for update using (
    target_user_id = auth.uid()
    or (target_user_id is null and (store_id is null or public.user_has_store_access(store_id)))
  );

-- Inserts only via service_role (cron jobs) — no policy = no client insert.

grant select, update on public.notifications to authenticated;

-- audit_log
alter table public.audit_log enable row level security;

create policy audit_select on public.audit_log
  for select using (
    org_id = public.current_org()
    and public.current_role() in ('super_admin','accountant')
  );

-- No insert/update/delete policies = clients cannot write. Server-side functions
-- with security definer (the RPCs in slice 8) will write via service_role.

grant select on public.audit_log to authenticated;
