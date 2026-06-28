-- ShelfCure Cloud — Migration 0069
-- ShelfCure Console: management UI for the global master_medicines catalog
-- (ADR-0018 extension). master_medicines already existed (migration 0021) and
-- already powers the Add-Medicine autocomplete in apps/web — the only gap was
-- that nothing could write to it except service_role (admin tooling/seeders).
-- This adds a `category` column plus full CRUD RPCs for platform admins.
--
-- category is plain text, not a foreign key — same style as this table's
-- existing `dosage_form` column. master_medicines is a single shared catalog
-- with no org_id; categories, by contrast, are per-org (medicine_categories).
-- A text label lets apps/web's autofill *suggest* a category by matching
-- against the signed-in store's own category list, without forcing every
-- org onto one fixed taxonomy.

-- ============================================================================
-- 1) master_medicines.category
-- ============================================================================

alter table public.master_medicines
  add column if not exists category text;

comment on column public.master_medicines.category is
  'Suggested category label (e.g. "Antibiotic"). Free text, not a foreign key — matched by name against the signed-in store''s own medicine_categories when autofilling Add Medicine in apps/web.';

-- ============================================================================
-- 2) rpc_console_list_master_medicines — paginated + searchable.
-- ============================================================================

create or replace function public.rpc_console_list_master_medicines(
  p_query text default null,
  p_page  integer default 1,
  p_limit integer default 50
)
returns table (
  id                uuid,
  name              text,
  salt_composition  text,
  strength          text,
  manufacturer      text,
  dosage_form       text,
  pack_size         integer,
  pack_unit         text,
  units_per_pack    integer,
  hsn_code          text,
  default_gst_rate  numeric,
  barcode           text,
  category          text,
  created_at        timestamptz,
  updated_at        timestamptz,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_page   integer := greatest(1, coalesce(p_page, 1));
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  return query
    select
      m.id, m.name, m.salt_composition, m.strength, m.manufacturer, m.dosage_form,
      m.pack_size, m.pack_unit, m.units_per_pack, m.hsn_code, m.default_gst_rate,
      m.barcode, m.category, m.created_at, m.updated_at,
      count(*) over () as total_count
    from public.master_medicines m
    where v_q is null
      or m.name ilike '%' || v_q || '%'
      or coalesce(m.salt_composition, '') ilike '%' || v_q || '%'
      or coalesce(m.manufacturer, '') ilike '%' || v_q || '%'
    order by m.name asc
    limit v_limit
    offset (v_page - 1) * v_limit;
end;
$$;

comment on function public.rpc_console_list_master_medicines(text, integer, integer) is
  'Platform-admin-only: paginated, searchable list of the global master_medicines catalog, for the Console Master Medicines page.';

revoke all on function public.rpc_console_list_master_medicines(text, integer, integer) from public;
grant execute on function public.rpc_console_list_master_medicines(text, integer, integer) to authenticated;

-- ============================================================================
-- 3) rpc_console_create_master_medicine
-- ============================================================================

create or replace function public.rpc_console_create_master_medicine(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new public.master_medicines;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if not (p_payload ? 'name') or length(trim(p_payload->>'name')) < 1 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.master_medicines (
    name, salt_composition, strength, manufacturer, dosage_form,
    pack_size, pack_unit, units_per_pack, hsn_code, default_gst_rate, barcode, category
  ) values (
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'salt_composition', '')), ''),
    nullif(trim(coalesce(p_payload->>'strength', '')), ''),
    nullif(trim(coalesce(p_payload->>'manufacturer', '')), ''),
    nullif(trim(coalesce(p_payload->>'dosage_form', '')), ''),
    (p_payload->>'pack_size')::integer,
    nullif(trim(coalesce(p_payload->>'pack_unit', '')), ''),
    (p_payload->>'units_per_pack')::integer,
    nullif(trim(coalesce(p_payload->>'hsn_code', '')), ''),
    (p_payload->>'default_gst_rate')::numeric,
    nullif(trim(coalesce(p_payload->>'barcode', '')), ''),
    nullif(trim(coalesce(p_payload->>'category', '')), '')
  )
  returning * into v_new;

  return to_jsonb(v_new);
end;
$$;

comment on function public.rpc_console_create_master_medicine(jsonb) is
  'Platform-admin-only: adds a medicine to the global master_medicines catalog, immediately available to every org''s Add-Medicine autocomplete.';

revoke all on function public.rpc_console_create_master_medicine(jsonb) from public;
grant execute on function public.rpc_console_create_master_medicine(jsonb) to authenticated;

-- ============================================================================
-- 4) rpc_console_update_master_medicine — jsonb partial update.
-- ============================================================================

create or replace function public.rpc_console_update_master_medicine(p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.master_medicines;
  v_after  public.master_medicines;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_target from public.master_medicines where id = p_id;
  if v_target.id is null then
    raise exception 'not_found: master medicine' using errcode = 'P0002';
  end if;

  if p_payload ? 'name' and length(trim(p_payload->>'name')) < 1 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  update public.master_medicines set
    name             = coalesce(nullif(trim(p_payload->>'name'), ''), name),
    salt_composition = case when p_payload ? 'salt_composition' then nullif(trim(p_payload->>'salt_composition'), '') else salt_composition end,
    strength         = case when p_payload ? 'strength' then nullif(trim(p_payload->>'strength'), '') else strength end,
    manufacturer     = case when p_payload ? 'manufacturer' then nullif(trim(p_payload->>'manufacturer'), '') else manufacturer end,
    dosage_form      = case when p_payload ? 'dosage_form' then nullif(trim(p_payload->>'dosage_form'), '') else dosage_form end,
    pack_size        = case when p_payload ? 'pack_size' then (p_payload->>'pack_size')::integer else pack_size end,
    pack_unit        = case when p_payload ? 'pack_unit' then nullif(trim(p_payload->>'pack_unit'), '') else pack_unit end,
    units_per_pack   = case when p_payload ? 'units_per_pack' then (p_payload->>'units_per_pack')::integer else units_per_pack end,
    hsn_code         = case when p_payload ? 'hsn_code' then nullif(trim(p_payload->>'hsn_code'), '') else hsn_code end,
    default_gst_rate = case when p_payload ? 'default_gst_rate' then (p_payload->>'default_gst_rate')::numeric else default_gst_rate end,
    barcode          = case when p_payload ? 'barcode' then nullif(trim(p_payload->>'barcode'), '') else barcode end,
    category         = case when p_payload ? 'category' then nullif(trim(p_payload->>'category'), '') else category end,
    updated_at       = now()
  where id = p_id
  returning * into v_after;

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_console_update_master_medicine(uuid, jsonb) is
  'Platform-admin-only partial update of a master_medicines row.';

revoke all on function public.rpc_console_update_master_medicine(uuid, jsonb) from public;
grant execute on function public.rpc_console_update_master_medicine(uuid, jsonb) to authenticated;

-- ============================================================================
-- 5) rpc_console_delete_master_medicine — nothing else references this
--    table by id (it's a pure autocomplete source), so deletion is always safe.
-- ============================================================================

create or replace function public.rpc_console_delete_master_medicine(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.master_medicines where id = p_id) then
    raise exception 'not_found: master medicine' using errcode = 'P0002';
  end if;

  delete from public.master_medicines where id = p_id;
end;
$$;

comment on function public.rpc_console_delete_master_medicine(uuid) is
  'Platform-admin-only: removes a medicine from the global master_medicines catalog. Safe — no other table references master_medicines by id.';

revoke all on function public.rpc_console_delete_master_medicine(uuid) from public;
grant execute on function public.rpc_console_delete_master_medicine(uuid) to authenticated;
