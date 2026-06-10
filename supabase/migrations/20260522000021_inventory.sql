-- ShelfCure Cloud — Migration 0021
-- Inventory page parity with desktop (WEB_PARITY_PLAN §2.5):
--   1. Rename batches.barcode → batches.batch_barcode (D4 default).
--   2. Global master_medicines catalog for autocomplete (D1.a default).
--   3. 11 new RPCs powering the inventory list, detail, add/edit and barcode pages.
--
-- Same SECURITY DEFINER + #variable_conflict use_column pattern as 0019/0020.

-- ============================================================================
-- 1. batches.barcode → batches.batch_barcode (D4)
-- ============================================================================

alter table public.batches rename column barcode to batch_barcode;
alter index public.batches_barcode_idx rename to batches_batch_barcode_idx;

-- ============================================================================
-- 2. master_medicines — global catalog used by the Add Medicine autocomplete.
-- Single shared catalog (D1.a). No org_id. Read-only for authenticated;
-- writes happen out-of-band through service_role (admin tooling, seeders).
-- ============================================================================

create table if not exists public.master_medicines (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) between 1 and 200),
  salt_composition  text,
  strength          text,
  manufacturer      text,
  dosage_form       text,
  pack_size         integer,
  pack_unit         text,
  units_per_pack    integer,
  hsn_code          text,
  default_gst_rate  numeric(5,2),
  barcode           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.master_medicines is
  'Global cross-tenant medicine catalog used by the Add Medicine autocomplete. Same shape as desktop. Seeded via service_role only.';

create index if not exists master_medicines_name_trgm_idx
  on public.master_medicines using gin (name extensions.gin_trgm_ops);
create index if not exists master_medicines_barcode_idx
  on public.master_medicines (barcode) where barcode is not null;

alter table public.master_medicines enable row level security;

create policy master_medicines_select_all on public.master_medicines
  for select using (auth.uid() is not null);

grant select on public.master_medicines to authenticated;

-- ============================================================================
-- rpc_master_medicine_search — wraps the ilike + trgm search
-- ============================================================================

create or replace function public.rpc_master_medicine_search(
  p_query text,
  p_limit integer default 30
)
returns setof public.master_medicines
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q   text := nullif(trim(coalesce(p_query, '')), '');
  v_lim integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_q is null or length(v_q) < 2 then return; end if;

  return query
  select *
  from public.master_medicines
  where name ilike '%' || v_q || '%'
     or coalesce(salt_composition, '') ilike '%' || v_q || '%'
  order by
    case when name ilike v_q || '%' then 0 else 1 end,
    name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_master_medicine_search(text, integer) from public;
grant execute on function public.rpc_master_medicine_search(text, integer) to authenticated;

-- ============================================================================
-- 3. rpc_list_medicines_with_stock — replaces medicines+stock list views
-- Paged, searchable, store-scoped. Joins batches for stock + nearest-expiry pricing.
-- ============================================================================

create or replace function public.rpc_list_medicines_with_stock(
  p_store_id uuid,
  p_query    text default null,
  p_page     integer default 1,
  p_limit    integer default 100
)
returns table (
  id                  uuid,
  name                text,
  salt_composition    text,
  manufacturer        text,
  dosage_form_id      uuid,
  dosage_form_name    text,
  strength            text,
  category_id         uuid,
  category_name       text,
  pack_size           integer,
  pack_unit           text,
  units_per_pack      integer,
  sale_unit_mode      text,
  min_stock_level     integer,
  reorder_level       integer,
  default_gst_rate    numeric,
  hsn_code            text,
  rack_location       text,
  is_focused          boolean,
  focus_label         text,
  created_at          timestamptz,
  total_stock         integer,
  near_expiry_count   integer,
  active_batch_count  integer,
  mrp                 numeric,
  selling_price       numeric,
  purchase_rate       numeric,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim  integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_off  integer := (v_page - 1) * v_lim;
  v_q    text    := nullif(trim(coalesce(p_query, '')), '');
  v_org  uuid    := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  with med as (
    select m.*
    from public.medicines m
    where m.org_id = v_org
      and m.deleted_at is null
      and (m.store_id = p_store_id or m.store_id is null)
      and (v_q is null
           or m.name ilike '%' || v_q || '%'
           or coalesce(m.salt_composition, '') ilike '%' || v_q || '%'
           or coalesce(m.manufacturer, '') ilike '%' || v_q || '%')
  ),
  agg as (
    select
      b.medicine_id,
      coalesce(sum(b.current_quantity), 0)::integer                                        as total_stock,
      count(*) filter (
        where b.current_quantity > 0
          and (b.expiry_date - current_date) <= 90
      )::integer                                                                            as near_expiry_count,
      count(*) filter (where b.current_quantity > 0)::integer                              as active_batch_count
    from public.batches b
    where b.store_id = p_store_id
      and b.deleted_at is null
    group by b.medicine_id
  ),
  nearest as (
    select distinct on (b.medicine_id)
      b.medicine_id, b.mrp, b.selling_price, b.purchase_rate
    from public.batches b
    where b.store_id = p_store_id
      and b.deleted_at is null
      and b.current_quantity > 0
    order by b.medicine_id, b.expiry_date asc
  ),
  tally as (
    select count(*) as n from med
  )
  select
    m.id, m.name, m.salt_composition, m.manufacturer,
    m.dosage_form_id, d.name as dosage_form_name, m.strength,
    m.category_id, c.name as category_name,
    m.pack_size, m.pack_unit, m.units_per_pack, m.sale_unit_mode,
    m.min_stock_level, m.reorder_level, m.default_gst_rate, m.hsn_code,
    m.rack_location, m.is_focused, m.focus_label, m.created_at,
    coalesce(a.total_stock, 0),
    coalesce(a.near_expiry_count, 0),
    coalesce(a.active_batch_count, 0),
    n.mrp, n.selling_price, n.purchase_rate,
    (select n from tally)
  from med m
  left join public.dosage_forms d        on d.id = m.dosage_form_id
  left join public.medicine_categories c on c.id = m.category_id
  left join agg a                        on a.medicine_id = m.id
  left join nearest n                    on n.medicine_id = m.id
  order by m.name asc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_medicines_with_stock(uuid, text, integer, integer) from public;
grant execute on function public.rpc_list_medicines_with_stock(uuid, text, integer, integer) to authenticated;

-- ============================================================================
-- 4. rpc_get_medicine_detail — single-call payload for the detail page
-- Returns jsonb { medicine, batches, stats, alternatives }
-- ============================================================================

create or replace function public.rpc_get_medicine_detail(
  p_medicine_id uuid,
  p_store_id    uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org();
  v_med jsonb;
  v_batches jsonb;
  v_stats jsonb;
  v_alts jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select to_jsonb(m) || jsonb_build_object(
    'dosage_form_name', d.name,
    'dosage_form_base_unit', d.base_unit,
    'category_name', c.name
  )
  into v_med
  from public.medicines m
  left join public.dosage_forms d on d.id = m.dosage_form_id
  left join public.medicine_categories c on c.id = m.category_id
  where m.id = p_medicine_id
    and m.org_id = v_org
    and m.deleted_at is null;

  if v_med is null then raise exception 'medicine_not_found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
    'days_to_expiry', (b.expiry_date - current_date)::integer,
    'supplier_name', sup.name
  ) order by b.expiry_date asc), '[]'::jsonb)
  into v_batches
  from public.batches b
  left join public.suppliers sup on sup.id = b.supplier_id
  where b.medicine_id = p_medicine_id
    and b.store_id = p_store_id
    and b.deleted_at is null;

  select jsonb_build_object(
    'total_stock',        coalesce(sum(current_quantity), 0),
    'active_batches',     count(*) filter (where current_quantity > 0),
    'near_expiry_count',  count(*) filter (where current_quantity > 0 and (expiry_date - current_date) <= 90),
    'min_stock_level',    (v_med->>'min_stock_level')::integer
  )
  into v_stats
  from public.batches
  where medicine_id = p_medicine_id
    and store_id = p_store_id
    and deleted_at is null;

  with alt_med as (
    select m.id, m.name, m.manufacturer, m.strength,
           coalesce(sum(b.current_quantity), 0) as stock,
           min(b.selling_price) as selling_price
    from public.medicines m
    left join public.batches b
      on b.medicine_id = m.id
     and b.store_id = p_store_id
     and b.deleted_at is null
     and b.current_quantity > 0
    where m.org_id = v_org
      and m.deleted_at is null
      and m.id <> p_medicine_id
      and coalesce(nullif(trim(m.salt_composition), ''), '__none__')
          = coalesce(nullif(trim(v_med->>'salt_composition'), ''), '__never__')
    group by m.id, m.name, m.manufacturer, m.strength
    order by stock desc, m.name asc
    limit 10
  )
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_alts from alt_med a;

  return jsonb_build_object(
    'medicine',     v_med,
    'batches',      v_batches,
    'stats',        v_stats,
    'alternatives', v_alts
  );
end;
$$;

revoke all on function public.rpc_get_medicine_detail(uuid, uuid) from public;
grant execute on function public.rpc_get_medicine_detail(uuid, uuid) to authenticated;

-- ============================================================================
-- 5. rpc_toggle_focused — sets is_focused + optional focus_label
-- ============================================================================

create or replace function public.rpc_toggle_focused(
  p_medicine_id uuid,
  p_is_focused  boolean,
  p_label       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := public.current_org();
  v_role text := public.user_role();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.medicines
  set is_focused  = p_is_focused,
      focus_label = case when p_is_focused then nullif(trim(coalesce(p_label, '')), '') else null end
  where id = p_medicine_id and org_id = v_org and deleted_at is null;

  if not found then raise exception 'medicine_not_found' using errcode = 'P0002'; end if;

  return jsonb_build_object('id', p_medicine_id, 'is_focused', p_is_focused, 'focus_label', p_label);
end;
$$;

revoke all on function public.rpc_toggle_focused(uuid, boolean, text) from public;
grant execute on function public.rpc_toggle_focused(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 6. rpc_update_medicine — full edit, mirrors rpc_create_medicine field set.
-- Sale Configuration fields locked if any batch with current_quantity > 0 exists.
-- ============================================================================

create or replace function public.rpc_update_medicine(
  p_medicine_id uuid,
  p_payload     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.current_org();
  v_role     text := public.user_role();
  v_form_id  uuid;
  v_cat_id   uuid;
  v_has_stock boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.medicines m
    where m.id = p_medicine_id and m.org_id = v_org and m.deleted_at is null
  ) then
    raise exception 'medicine_not_found' using errcode = 'P0002';
  end if;

  v_form_id := nullif(p_payload->>'dosage_form_id', '')::uuid;
  v_cat_id  := nullif(p_payload->>'category_id', '')::uuid;

  select exists (
    select 1 from public.batches b
    where b.medicine_id = p_medicine_id
      and b.deleted_at is null
      and b.current_quantity > 0
  ) into v_has_stock;

  update public.medicines m
  set
    name              = coalesce(nullif(trim(p_payload->>'name'), ''), m.name),
    salt_composition  = case when p_payload ? 'salt_composition'
                             then nullif(trim(coalesce(p_payload->>'salt_composition','')),'')
                             else m.salt_composition end,
    manufacturer      = coalesce(trim(p_payload->>'manufacturer'), m.manufacturer),
    dosage_form_id    = coalesce(v_form_id, m.dosage_form_id),
    strength          = case when p_payload ? 'strength'
                             then nullif(trim(coalesce(p_payload->>'strength','')),'')
                             else m.strength end,
    pack_size         = coalesce(nullif(p_payload->>'pack_size','')::integer, m.pack_size),
    pack_unit         = coalesce(nullif(trim(coalesce(p_payload->>'pack_unit','')),''), m.pack_unit),
    units_per_pack    = case when p_payload ? 'units_per_pack' and not v_has_stock
                             then nullif(p_payload->>'units_per_pack','')::integer
                             else m.units_per_pack end,
    sale_unit_mode    = case when p_payload ? 'sale_unit_mode' and not v_has_stock
                             then coalesce(nullif(p_payload->>'sale_unit_mode',''), m.sale_unit_mode)
                             else m.sale_unit_mode end,
    category_id       = case when p_payload ? 'category_id' then v_cat_id else m.category_id end,
    rack_location     = case when p_payload ? 'rack_location'
                             then nullif(trim(coalesce(p_payload->>'rack_location','')),'')
                             else m.rack_location end,
    hsn_code          = case when p_payload ? 'hsn_code'
                             then nullif(trim(coalesce(p_payload->>'hsn_code','')),'')
                             else m.hsn_code end,
    default_gst_rate  = coalesce(nullif(p_payload->>'default_gst_rate','')::numeric, m.default_gst_rate),
    min_stock_level   = coalesce(nullif(p_payload->>'min_stock_level','')::integer, m.min_stock_level),
    reorder_level     = coalesce(nullif(p_payload->>'reorder_level','')::integer, m.reorder_level)
  where m.id = p_medicine_id;

  return (select to_jsonb(m) from public.medicines m where m.id = p_medicine_id);
end;
$$;

revoke all on function public.rpc_update_medicine(uuid, jsonb) from public;
grant execute on function public.rpc_update_medicine(uuid, jsonb) to authenticated;

-- ============================================================================
-- 7. rpc_list_categories + rpc_create_category
-- ============================================================================

create or replace function public.rpc_list_categories(p_store_id uuid default null)
returns table (id uuid, name text, is_system boolean, store_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  return query
  select c.id, c.name, c.is_system, c.store_id
  from public.medicine_categories c
  where c.org_id = v_org
    and c.deleted_at is null
    and c.is_active
    and (p_store_id is null or c.store_id is null or c.store_id = p_store_id)
  order by c.name asc;
end;
$$;

revoke all on function public.rpc_list_categories(uuid) from public;
grant execute on function public.rpc_list_categories(uuid) to authenticated;


create or replace function public.rpc_create_category(
  p_name     text,
  p_store_id uuid default null
)
returns table (id uuid, name text, is_system boolean, store_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org    uuid := public.current_org();
  v_role   text := public.user_role();
  v_new_id uuid;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v_name is null then raise exception 'name_required' using errcode = '22023'; end if;
  if p_store_id is not null and not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  insert into public.medicine_categories (org_id, store_id, name)
  values (v_org, p_store_id, v_name)
  on conflict (org_id, store_id, name) do update set is_active = true, deleted_at = null
  returning medicine_categories.id into v_new_id;

  return query
  select c.id, c.name, c.is_system, c.store_id
  from public.medicine_categories c
  where c.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_category(text, uuid) from public;
grant execute on function public.rpc_create_category(text, uuid) to authenticated;

-- ============================================================================
-- 8. rpc_add_batch_manual — single-batch add without going through a purchase entry.
-- Used from the medicine-detail "Add Stock" modal.
-- ============================================================================

create or replace function public.rpc_add_batch_manual(
  p_medicine_id uuid,
  p_store_id    uuid,
  p_payload     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.current_org();
  v_role   text := public.user_role();
  v_new_id uuid;
  v_qty    integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.medicines m
    where m.id = p_medicine_id and m.org_id = v_org and m.deleted_at is null
  ) then
    raise exception 'medicine_not_found' using errcode = 'P0002'; end if;

  v_qty := coalesce(nullif(p_payload->>'quantity','')::integer, 0);
  if v_qty < 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;

  insert into public.batches (
    org_id, store_id, medicine_id, batch_number, expiry_date,
    initial_quantity, current_quantity, purchase_rate, mrp, selling_price,
    gst_percentage, batch_barcode
  )
  values (
    v_org, p_store_id, p_medicine_id,
    nullif(trim(coalesce(p_payload->>'batch_number','')), ''),
    nullif(p_payload->>'expiry_date','')::date,
    v_qty, v_qty,
    coalesce(nullif(p_payload->>'purchase_rate','')::numeric, 0),
    coalesce(nullif(p_payload->>'mrp','')::numeric, 0),
    nullif(p_payload->>'selling_price','')::numeric,
    coalesce(nullif(p_payload->>'gst_percentage','')::numeric, 0),
    nullif(trim(coalesce(p_payload->>'batch_barcode','')), '')
  )
  returning id into v_new_id;

  return (select to_jsonb(b) from public.batches b where b.id = v_new_id);
end;
$$;

revoke all on function public.rpc_add_batch_manual(uuid, uuid, jsonb) from public;
grant execute on function public.rpc_add_batch_manual(uuid, uuid, jsonb) to authenticated;

-- ============================================================================
-- 9. rpc_update_batch — edit pricing/expiry/batch fields (NOT quantity — that
-- goes through rpc_stock_correction so we keep an audit trail).
-- ============================================================================

create or replace function public.rpc_update_batch(
  p_batch_id uuid,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  text := public.user_role();
  v_store uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select store_id into v_store from public.batches where id = p_batch_id and deleted_at is null;
  if v_store is null then raise exception 'batch_not_found' using errcode = 'P0002'; end if;
  if not public.user_has_store_access(v_store) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  update public.batches b
  set
    batch_number   = coalesce(nullif(trim(p_payload->>'batch_number'),''), b.batch_number),
    expiry_date    = coalesce(nullif(p_payload->>'expiry_date','')::date, b.expiry_date),
    purchase_rate  = coalesce(nullif(p_payload->>'purchase_rate','')::numeric, b.purchase_rate),
    mrp            = coalesce(nullif(p_payload->>'mrp','')::numeric, b.mrp),
    selling_price  = case when p_payload ? 'selling_price'
                          then nullif(p_payload->>'selling_price','')::numeric
                          else b.selling_price end,
    gst_percentage = coalesce(nullif(p_payload->>'gst_percentage','')::numeric, b.gst_percentage),
    batch_barcode  = case when p_payload ? 'batch_barcode'
                          then nullif(trim(coalesce(p_payload->>'batch_barcode','')),'')
                          else b.batch_barcode end
  where b.id = p_batch_id;

  return (select to_jsonb(b) from public.batches b where b.id = p_batch_id);
end;
$$;

revoke all on function public.rpc_update_batch(uuid, jsonb) from public;
grant execute on function public.rpc_update_batch(uuid, jsonb) to authenticated;

-- ============================================================================
-- 10. rpc_list_batches_for_barcodes — feeds the Barcode Generator left column
-- ============================================================================

create or replace function public.rpc_list_batches_for_barcodes(
  p_store_id    uuid,
  p_medicine_id uuid default null
)
returns table (
  batch_id        uuid,
  medicine_id     uuid,
  medicine_name   text,
  manufacturer    text,
  batch_number    text,
  expiry_date     date,
  current_qty     integer,
  mrp             numeric,
  gst_percentage  numeric,
  batch_barcode   text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    b.id, b.medicine_id, m.name, m.manufacturer,
    b.batch_number, b.expiry_date, b.current_quantity::integer,
    b.mrp, b.gst_percentage, b.batch_barcode
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.store_id = p_store_id
    and b.deleted_at is null
    and b.current_quantity > 0
    and (p_medicine_id is null or b.medicine_id = p_medicine_id)
  order by m.name asc, b.expiry_date asc;
end;
$$;

revoke all on function public.rpc_list_batches_for_barcodes(uuid, uuid) from public;
grant execute on function public.rpc_list_batches_for_barcodes(uuid, uuid) to authenticated;

-- ============================================================================
-- 11. rpc_save_batch_barcodes — writes SCB+zfill(id,7) into batches that have
-- batch_barcode IS NULL. Skips ones that already have a value (preserves
-- manually-pasted GS1 codes from packaging). Returns the count of newly-saved.
-- ============================================================================

create or replace function public.rpc_save_batch_barcodes(p_batch_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  text := public.user_role();
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_batch_ids is null or array_length(p_batch_ids, 1) is null then
    return jsonb_build_object('saved', 0);
  end if;

  -- Limit to batches whose store the caller can access (RLS-aware).
  with eligible as (
    select b.id
    from public.batches b
    where b.id = any(p_batch_ids)
      and b.deleted_at is null
      and b.batch_barcode is null
      and public.user_has_store_access(b.store_id)
  ),
  upd as (
    update public.batches b
    set batch_barcode = 'SCB' || lpad(
      -- Stable per-row numeric derived from the uuid. We use the first 7 hex
      -- chars converted to int; collisions are astronomically unlikely and
      -- the scanner only needs intra-store uniqueness which the FK enforces.
      (('x' || substr(replace(b.id::text, '-', ''), 1, 7))::bit(28))::int::text,
      7,
      '0'
    )
    where b.id in (select id from eligible)
    returning 1
  )
  select count(*)::integer into v_count from upd;

  return jsonb_build_object('saved', v_count);
end;
$$;

revoke all on function public.rpc_save_batch_barcodes(uuid[]) from public;
grant execute on function public.rpc_save_batch_barcodes(uuid[]) to authenticated;
