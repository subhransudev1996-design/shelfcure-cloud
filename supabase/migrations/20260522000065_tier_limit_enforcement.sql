-- ShelfCure Cloud — Migration 0065
-- Enforces billing_tiers.max_stores / max_staff (migration 0064) at the two
-- places stores and staff actually get created. An org with no
-- billing_tier_id (ungoverned — see 0064's comment) is never limited, so
-- existing/legacy orgs keep working exactly as before.
--
-- Both checks raise a clear 'tier_limit_reached: ...' error (errcode 23514,
-- matching a check-constraint-style "business rule violated" code) that the
-- calling Edge Function/UI can show directly to the user.

-- ============================================================================
-- 1) rpc_create_store (migration 0012) — max_stores.
-- ============================================================================

create or replace function public.rpc_create_store(p_payload jsonb)
returns table (
  id uuid,
  code text,
  name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_org_id     uuid;
  v_store_id   uuid;
  v_store_code text;
  v_store_name text;
  v_max_stores integer;
  v_current    bigint;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if public.user_role() <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can create stores (your role: %)',
      public.user_role()
      using errcode = '42501';
  end if;

  v_org_id := public.current_org();
  if v_org_id is null then
    raise exception 'permission_denied: no org context' using errcode = '42501';
  end if;

  select t.max_stores into v_max_stores
  from public.organizations o
  join public.billing_tiers t on t.id = o.billing_tier_id
  where o.id = v_org_id;

  if v_max_stores is not null then
    select count(*) into v_current from public.stores where org_id = v_org_id and is_active;
    if v_current >= v_max_stores then
      raise exception 'tier_limit_reached: your plan allows up to % store(s) — upgrade to add more', v_max_stores
        using errcode = '23514';
    end if;
  end if;

  insert into public.stores (
    org_id, code, name,
    gstin, drug_license_no,
    address, city, state, pincode, phone, email, owner_name,
    gst_scheme, gst_filing_type, idle_lock_minutes
  ) values (
    v_org_id,
    upper(trim(p_payload->>'code')),
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'gstin','')),''),
    nullif(trim(coalesce(p_payload->>'drug_license_no','')),''),
    coalesce(p_payload->>'address',''),
    coalesce(p_payload->>'city',''),
    coalesce(p_payload->>'state',''),
    coalesce(p_payload->>'pincode',''),
    coalesce(p_payload->>'phone',''),
    coalesce(p_payload->>'email',''),
    coalesce(p_payload->>'owner_name',''),
    coalesce(p_payload->>'gst_scheme','regular'),
    coalesce(p_payload->>'gst_filing_type','monthly'),
    coalesce((p_payload->>'idle_lock_minutes')::int, 10)
  )
  returning stores.id, stores.code, stores.name
  into v_store_id, v_store_code, v_store_name;

  return query select v_store_id, v_store_code, v_store_name;
end;
$$;

comment on function public.rpc_create_store(jsonb) is
  'Secure store creator. SECURITY DEFINER, checks user_role() = super_admin, enforces the org''s billing tier max_stores (if any), inserts into stores in the caller''s org.';

-- ============================================================================
-- 2) rpc_finalize_staff_profile (migration 0013) — max_staff.
-- ============================================================================

create or replace function public.rpc_finalize_staff_profile(
  p_user_id   uuid,
  p_email     text,
  p_full_name text,
  p_role      text,
  p_store_id  uuid default null,
  p_phone     text default null
)
returns table (
  id        uuid,
  full_name text,
  email     text,
  role      text,
  store_id  uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_org_id      uuid;
  v_caller_store uuid;
  v_new_id      uuid;
  v_max_staff   integer;
  v_current     bigint;
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_caller_role := public.user_role();
  v_org_id      := public.current_org();
  v_caller_store := public.current_store();

  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  -- Only super_admin and store_admin can create staff
  if v_caller_role not in ('super_admin', 'store_admin') then
    raise exception 'permission_denied: only super_admin or store_admin can create staff (your role: %)', v_caller_role
      using errcode = '42501';
  end if;

  if p_role not in ('store_admin', 'pharmacist', 'cashier', 'accountant') then
    raise exception 'invalid_role: %', p_role using errcode = '22023';
  end if;

  -- store_admin can only create pharmacist/cashier for THEIR store
  if v_caller_role = 'store_admin' then
    if p_role not in ('pharmacist', 'cashier') then
      raise exception 'permission_denied: store_admin can only create pharmacist/cashier'
        using errcode = '42501';
    end if;
    if p_store_id is distinct from v_caller_store then
      raise exception 'permission_denied: store_admin can only assign staff to their own store'
        using errcode = '42501';
    end if;
  end if;

  -- Scope/role consistency (matches user_profiles_scope_matches_role constraint)
  if p_role in ('store_admin', 'pharmacist', 'cashier') then
    if p_store_id is null then
      raise exception 'store_required_for_role: %', p_role using errcode = '23502';
    end if;
    -- Ensure store belongs to caller's org
    if not exists (select 1 from public.stores where id = p_store_id and org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  elsif p_role = 'accountant' then
    p_store_id := null;
  end if;

  -- Block duplicate profile (in case Edge Function retries)
  if exists (select 1 from public.user_profiles where id = p_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  select t.max_staff into v_max_staff
  from public.organizations o
  join public.billing_tiers t on t.id = o.billing_tier_id
  where o.id = v_org_id;

  if v_max_staff is not null then
    -- Counts everyone except the org owner (super_admin) — the owner isn't
    -- "a seat" in the same sense, mirroring how plans are usually marketed.
    select count(*) into v_current
    from public.user_profiles
    where org_id = v_org_id and is_active and role <> 'super_admin';
    if v_current >= v_max_staff then
      raise exception 'tier_limit_reached: your plan allows up to % staff member(s) — upgrade to add more', v_max_staff
        using errcode = '23514';
    end if;
  end if;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (
    p_user_id,
    v_org_id,
    p_store_id,
    trim(p_full_name),
    p_email::extensions.citext,
    nullif(trim(coalesce(p_phone, '')), ''),
    p_role
  )
  returning user_profiles.id into v_new_id;

  return query
    select
      p.id,
      p.full_name,
      p.email::text,
      p.role,
      p.store_id
    from public.user_profiles p
    where p.id = v_new_id;
end;
$$;

comment on function public.rpc_finalize_staff_profile(uuid, text, text, text, uuid, text) is
  'Called by the create-staff Edge Function after admin.createUser succeeds. Inserts the user_profiles row with role/scope validation and enforces the org''s billing tier max_staff (if any, excluding the owner seat).';
