-- ShelfCure Cloud — Migration 0015
-- POS helper RPCs: medicine search with stock, atomic bill numbering, store context.
--
-- All read-only EXCEPT rpc_pos_next_bill_number which advances a counter row.
-- SECURITY DEFINER + locked search_path everywhere. Add `#variable_conflict use_column`
-- where the OUT params collide with column names (see migration 0014 root cause).

-- ============================================================================
-- bill_counters — per-store sequence for bill numbers
-- Why a table instead of a Postgres sequence?
--   - Sequences are global and can't be reset per-store without DDL.
--   - We want one strictly increasing number per (store, prefix) namespace
--     so we can keep formats like INV/2026-05/0001 monotonic per month.
--   - Locking a row with SELECT ... FOR UPDATE inside a SECURITY DEFINER
--     function gives us atomicity with no risk of holes from rolled-back
--     transactions (since the row update is only persisted if the surrounding
--     txn commits, and skipped numbers don't matter much in retail).
-- ============================================================================

create table if not exists public.bill_counters (
  store_id   uuid not null references public.stores(id) on delete cascade,
  scope      text not null,                      -- e.g. 'sale:2026-05'
  last_value integer not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, scope)
);

comment on table public.bill_counters is
  'Per-store monotonic counters for bill/invoice numbering. Locked per-row to allocate atomically.';

alter table public.bill_counters enable row level security;

-- Counters never touched by client directly — only via rpc_pos_next_bill_number.
-- No RLS policies = nothing is selectable/writable by `authenticated` directly.


-- ============================================================================
-- rpc_pos_next_bill_number — allocate next bill number for a store
--
-- Format: <PREFIX>/YYYY-MM/NNNN  (e.g. INV/2026-05/0001)
-- The counter resets at month boundaries automatically via the scope key.
-- ============================================================================

create or replace function public.rpc_pos_next_bill_number(
  p_store_id uuid,
  p_prefix   text default 'INV'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope     text;
  v_next      integer;
  v_period    text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_period := to_char(current_date, 'YYYY-MM');
  v_scope  := lower(p_prefix) || ':' || v_period;

  -- Upsert + return-incremented in one statement so concurrent callers serialize
  -- on the primary-key row lock without needing an explicit advisory lock.
  insert into public.bill_counters (store_id, scope, last_value, updated_at)
  values (p_store_id, v_scope, 1, now())
  on conflict (store_id, scope) do update
    set last_value = public.bill_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return p_prefix || '/' || v_period || '/' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.rpc_pos_next_bill_number(uuid, text) from public;
grant execute on function public.rpc_pos_next_bill_number(uuid, text) to authenticated;


-- ============================================================================
-- rpc_pos_search_medicines — fast keyboard search for the POS screen
--
-- Returns up to N medicines matching the query (prefix + trigram fallback),
-- with their best FEFO batch (nearest expiry having stock). The POS uses the
-- returned batch_id directly when adding a line; cashier can switch batch
-- afterward if the customer specifically asks for a different one.
-- ============================================================================

create or replace function public.rpc_pos_search_medicines(
  p_store_id uuid,
  p_query    text,
  p_limit    integer default 12
)
returns table (
  medicine_id      uuid,
  name             text,
  manufacturer     text,
  pack_size        integer,
  pack_unit        text,
  hsn_code         text,
  default_gst_rate numeric,
  batch_id         uuid,
  batch_number     text,
  expiry_date      date,
  mrp              numeric,
  selling_price    numeric,
  gst_percentage   numeric,
  current_quantity integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org_id uuid := public.current_org();
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_lim    integer := greatest(1, least(coalesce(p_limit, 12), 50));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  with org_meds as (
    select m.*
    from public.medicines m
    where m.org_id = v_org_id
      and m.deleted_at is null
      and (
        m.store_id is null  -- org-wide master
        or m.store_id = p_store_id
      )
  ),
  matched as (
    select
      om.*,
      case
        when v_q is null then 1.0
        when om.name ilike v_q || '%' then 1.0
        when om.barcode = v_q then 1.0
        when om.name ilike '%' || v_q || '%' then 0.7
        else extensions.similarity(om.name, v_q)
      end as score
    from org_meds om
    where v_q is null
       or om.name ilike '%' || v_q || '%'
       or om.barcode = v_q
       or extensions.similarity(om.name, v_q) > 0.2
  ),
  best_batch as (
    select distinct on (b.medicine_id)
      b.medicine_id,
      b.id            as batch_id,
      b.batch_number,
      b.expiry_date,
      b.mrp,
      b.selling_price,
      b.gst_percentage,
      b.current_quantity
    from public.batches b
    where b.store_id = p_store_id
      and b.deleted_at is null
      and b.is_blocked = false
      and b.current_quantity > 0
      and b.expiry_date >= current_date
    order by b.medicine_id, b.expiry_date asc, b.created_at asc
  )
  select
    m.id,
    m.name,
    m.manufacturer,
    m.pack_size,
    m.pack_unit,
    m.hsn_code,
    m.default_gst_rate,
    bb.batch_id,
    bb.batch_number,
    bb.expiry_date,
    bb.mrp,
    bb.selling_price,
    coalesce(bb.gst_percentage, m.default_gst_rate),
    coalesce(bb.current_quantity, 0)
  from matched m
  left join best_batch bb on bb.medicine_id = m.id
  order by m.score desc, m.name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_pos_search_medicines(uuid, text, integer) from public;
grant execute on function public.rpc_pos_search_medicines(uuid, text, integer) to authenticated;


-- ============================================================================
-- rpc_pos_get_store_context — store row + intra-state flag input
-- Reads the store + its state so the POS can decide CGST+SGST vs IGST when a
-- customer GSTIN/state is entered. Returned as a flat row for easy consumption.
-- ============================================================================

create or replace function public.rpc_pos_get_store_context(p_store_id uuid)
returns table (
  store_id    uuid,
  store_code  text,
  store_name  text,
  store_state text,
  org_gstin   text,
  org_name    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.code,
    s.name,
    s.state,
    o.gstin_default,
    o.name
  from public.stores s
  join public.organizations o on o.id = s.org_id
  where s.id = p_store_id;
end;
$$;

revoke all on function public.rpc_pos_get_store_context(uuid) from public;
grant execute on function public.rpc_pos_get_store_context(uuid) to authenticated;
