-- ShelfCure Cloud — Migration 0014
-- Fix "column reference 'id' is ambiguous" in rpc_finalize_staff_profile.
--
-- Root cause:
--   When a PL/pgSQL function uses `returns table (id uuid, full_name text, role text, ...)`,
--   those OUT columns become VARIABLES inside the function body. Any unqualified
--   reference like `where id = p_user_id` then collides with the table column `id`,
--   raising 42702 "column reference is ambiguous".
--
-- Fix:
--   1. Add `#variable_conflict use_column` so unqualified names default to the column.
--   2. Defensively qualify the existence check.
--   We rebuild both staff RPCs in this migration for clarity.

create or replace function public.rpc_list_staff()
returns table (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  role            text,
  store_id        uuid,
  store_code      text,
  store_name      text,
  is_active       boolean,
  last_login_at   timestamptz,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_role    text;
  v_store   uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_role  := public.user_role();
  v_org_id := public.current_org();
  v_store := public.current_store();

  if v_role is null or v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_role = 'super_admin' or v_role = 'accountant' then
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.org_id = v_org_id
      order by p.role, p.full_name;
  elsif v_role = 'store_admin' then
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.org_id = v_org_id
        and p.store_id = v_store
      order by p.role, p.full_name;
  else
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.id = v_user_id;
  end if;
end;
$$;

revoke all on function public.rpc_list_staff() from public;
grant execute on function public.rpc_list_staff() to authenticated;


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
#variable_conflict use_column
declare
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_org_id       uuid;
  v_caller_store uuid;
  v_new_id       uuid;
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_caller_role  := public.user_role();
  v_org_id       := public.current_org();
  v_caller_store := public.current_store();

  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_caller_role not in ('super_admin', 'store_admin') then
    raise exception 'permission_denied: only super_admin or store_admin can create staff (your role: %)', v_caller_role
      using errcode = '42501';
  end if;

  if p_role not in ('store_admin', 'pharmacist', 'cashier', 'accountant') then
    raise exception 'invalid_role: %', p_role using errcode = '22023';
  end if;

  -- store_admin restrictions
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

  -- Scope/role consistency
  if p_role in ('store_admin', 'pharmacist', 'cashier') then
    if p_store_id is null then
      raise exception 'store_required_for_role: %', p_role using errcode = '23502';
    end if;
    if not exists (
      select 1 from public.stores s
      where s.id = p_store_id and s.org_id = v_org_id
    ) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  elsif p_role = 'accountant' then
    p_store_id := null;
  end if;

  -- Duplicate guard (qualified to avoid ambiguity with OUT param `id`)
  if exists (
    select 1 from public.user_profiles up where up.id = p_user_id
  ) then
    raise exception 'profile_already_exists' using errcode = '23505';
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
      up.id,
      up.full_name,
      up.email::text,
      up.role,
      up.store_id
    from public.user_profiles up
    where up.id = v_new_id;
end;
$$;

revoke all on function public.rpc_finalize_staff_profile(uuid, text, text, text, uuid, text) from public;
grant execute on function public.rpc_finalize_staff_profile(uuid, text, text, text, uuid, text) to authenticated;
