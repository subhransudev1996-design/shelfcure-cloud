-- ShelfCure Cloud — Migration 0066
-- Fixes a latent bug surfaced while live-testing migration 0065's max_staff
-- enforcement: rpc_finalize_staff_profile's RETURNS TABLE(id uuid, ...)
-- declares an output parameter named `id`, which PL/pgSQL's default
-- plpgsql.variable_conflict='error' treats as ambiguous against any
-- unqualified `id` column reference inside the function body (e.g.
-- `where id = p_user_id`) — raising '42702: column reference "id" is
-- ambiguous' at runtime, the first time that statement actually executes.
-- This was already latent in the original function (migration 0013) and
-- migration 0014's "ambiguity" fix apparently didn't cover every call site;
-- it had just never been exercised live in this environment until now.
-- Fix: qualify every `id` reference with its table alias.

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
    if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  elsif p_role = 'accountant' then
    p_store_id := null;
  end if;

  -- Block duplicate profile (in case Edge Function retries)
  if exists (select 1 from public.user_profiles up where up.id = p_user_id) then
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
    from public.user_profiles up
    where up.org_id = v_org_id and up.is_active and up.role <> 'super_admin';
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
  'Called by the create-staff Edge Function after admin.createUser succeeds. Inserts the user_profiles row with role/scope validation and enforces the org''s billing tier max_staff (if any, excluding the owner seat). Every `id` reference is table-qualified to avoid PL/pgSQL ambiguity against the RETURNS TABLE(id, ...) output parameter.';
