-- ShelfCure Cloud — Migration 0016
-- Master-record creation via SECURITY DEFINER RPCs.
--
-- Why a new pattern? Direct .from('table').insert() through PostgREST hits
-- intermittent RLS quirks on certain tables (see migrations 0010-0012 for the
-- stores saga). Routing master creates through a SECURITY DEFINER RPC keeps
-- the role/tenancy check in one place (Postgres) and bypasses the PostgREST
-- layer's policy interpretation idiosyncrasies.
--
-- Conventions for these RPCs:
--   1. Caller must be authenticated.
--   2. Role gate enforced in SQL (super_admin/store_admin/pharmacist).
--   3. org_id is derived from current_org(); never trusted from payload.
--   4. store_id, if provided, must belong to caller's org AND be accessible.
--   5. `#variable_conflict use_column` prevents OUT-param/column ambiguity.
--   6. Return the freshly-inserted row so the client can render immediately.

-- ============================================================================
-- rpc_create_supplier
-- ============================================================================

create or replace function public.rpc_create_supplier(p_payload jsonb)
returns table (
  id          uuid,
  name        text,
  city        text,
  state       text,
  phone       text,
  gstin       text,
  is_active   boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_role     text;
  v_store_id uuid;
  v_new_id   uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_org_id := public.current_org();
  v_role   := public.user_role();

  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_role not in ('super_admin', 'store_admin', 'pharmacist') then
    raise exception 'permission_denied: cannot create suppliers (your role: %)', v_role
      using errcode = '42501';
  end if;

  -- store_id is optional. null = org-wide supplier (shared across all stores).
  v_store_id := nullif(p_payload->>'store_id', '')::uuid;
  if v_store_id is not null then
    if not exists (
      select 1 from public.stores s
      where s.id = v_store_id and s.org_id = v_org_id
    ) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  end if;

  insert into public.suppliers (
    org_id, store_id, name, gstin, address, city, state, pincode,
    phone, email, contact_person, credit_limit, credit_days
  )
  values (
    v_org_id,
    v_store_id,
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'gstin','')),''),
    nullif(trim(coalesce(p_payload->>'address','')),''),
    nullif(trim(coalesce(p_payload->>'city','')),''),
    nullif(trim(coalesce(p_payload->>'state','')),''),
    nullif(trim(coalesce(p_payload->>'pincode','')),''),
    nullif(trim(coalesce(p_payload->>'phone','')),''),
    nullif(trim(coalesce(p_payload->>'email','')),''),
    nullif(trim(coalesce(p_payload->>'contact_person','')),''),
    nullif(p_payload->>'credit_limit','')::numeric,
    nullif(p_payload->>'credit_days','')::integer
  )
  returning suppliers.id into v_new_id;

  return query
    select s.id, s.name, s.city, s.state, s.phone, s.gstin, s.is_active
    from public.suppliers s
    where s.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_supplier(jsonb) from public;
grant execute on function public.rpc_create_supplier(jsonb) to authenticated;


-- ============================================================================
-- rpc_list_suppliers — returns suppliers visible in caller's org/store
-- ============================================================================

create or replace function public.rpc_list_suppliers(p_store_id uuid default null)
returns table (
  id        uuid,
  name      text,
  city      text,
  state     text,
  phone     text,
  gstin     text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org_id uuid := public.current_org();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, coalesce(s.city,''), coalesce(s.state,''),
         coalesce(s.phone,''), s.gstin, s.is_active
  from public.suppliers s
  where s.org_id = v_org_id
    and s.deleted_at is null
    and (
      s.store_id is null
      or p_store_id is null
      or s.store_id = p_store_id
    )
  order by s.name asc;
end;
$$;

revoke all on function public.rpc_list_suppliers(uuid) from public;
grant execute on function public.rpc_list_suppliers(uuid) to authenticated;


-- ============================================================================
-- rpc_create_medicine — used by add-medicine flow AND quick-add inside purchase entry
-- ============================================================================

create or replace function public.rpc_create_medicine(p_payload jsonb)
returns table (
  id               uuid,
  name             text,
  manufacturer     text,
  default_gst_rate numeric,
  pack_size        integer,
  pack_unit        text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_role     text;
  v_store_id uuid;
  v_form_id  uuid;
  v_new_id   uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_org_id := public.current_org();
  v_role   := public.user_role();

  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_role not in ('super_admin', 'store_admin', 'pharmacist') then
    raise exception 'permission_denied: cannot create medicines' using errcode = '42501';
  end if;

  v_store_id := nullif(p_payload->>'store_id', '')::uuid;
  if v_store_id is not null then
    if not exists (
      select 1 from public.stores s
      where s.id = v_store_id and s.org_id = v_org_id
    ) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  end if;

  v_form_id := nullif(p_payload->>'dosage_form_id', '')::uuid;
  if v_form_id is null or not exists (
    select 1 from public.dosage_forms d where d.id = v_form_id
  ) then
    raise exception 'invalid_dosage_form_id' using errcode = '23503';
  end if;

  insert into public.medicines (
    org_id, store_id, name, salt_composition, manufacturer,
    dosage_form_id, strength, pack_size, pack_unit, units_per_pack,
    sale_unit_mode, default_gst_rate, hsn_code, barcode,
    reorder_level, min_stock_level
  )
  values (
    v_org_id,
    v_store_id,
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'salt_composition','')),''),
    coalesce(trim(p_payload->>'manufacturer'), ''),
    v_form_id,
    nullif(trim(coalesce(p_payload->>'strength','')),''),
    coalesce(nullif(p_payload->>'pack_size','')::integer, 1),
    coalesce(nullif(trim(coalesce(p_payload->>'pack_unit','')),''),'strip'),
    nullif(p_payload->>'units_per_pack','')::integer,
    coalesce(nullif(p_payload->>'sale_unit_mode',''),'pack_only'),
    coalesce(nullif(p_payload->>'default_gst_rate','')::numeric, 0),
    nullif(trim(coalesce(p_payload->>'hsn_code','')),''),
    nullif(trim(coalesce(p_payload->>'barcode','')),''),
    coalesce(nullif(p_payload->>'reorder_level','')::integer, 20),
    coalesce(nullif(p_payload->>'min_stock_level','')::integer, 10)
  )
  returning medicines.id into v_new_id;

  return query
    select m.id, m.name, m.manufacturer, m.default_gst_rate, m.pack_size, m.pack_unit
    from public.medicines m
    where m.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_medicine(jsonb) from public;
grant execute on function public.rpc_create_medicine(jsonb) to authenticated;
