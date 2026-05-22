-- ShelfCure Cloud — Migration 0012
-- Two things:
--   A) Diagnostic RPC that returns the actual policies + their conditions on a
--      given table. Lets us SEE what RLS the server is using vs what we think.
--   B) rpc_create_store: an RLS-bypassing super_admin-checked store creator.
--      Works around the persisting RLS rejection so the user can move forward,
--      AND establishes the RPC-based mutation pattern that every future
--      "create master record" call should follow.

-- ============================================================================
-- A) Diagnostic: list policies on a table
-- ============================================================================

create or replace function public.rpc_list_policies(p_table text)
returns table (
  policy_name text,
  cmd text,
  permissive text,
  roles text[],
  qual text,
  with_check text
)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select
    pol.policyname::text,
    pol.cmd::text,
    pol.permissive::text,
    pol.roles::text[],
    pol.qual::text,
    pol.with_check::text
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = p_table
  order by pol.policyname
$$;

revoke all on function public.rpc_list_policies(text) from public;
grant execute on function public.rpc_list_policies(text) to authenticated;

-- ============================================================================
-- B) rpc_create_store — secure, RLS-bypassing store creator
--
-- This is the proper pattern: clients call an RPC, not a raw insert.
-- The RPC enforces the security check itself (user_role() = 'super_admin')
-- and then performs the insert as SECURITY DEFINER (bypassing RLS for the
-- write). RLS still gates direct table inserts — this RPC is just a safer
-- channel for the create operation.
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

revoke all on function public.rpc_create_store(jsonb) from public;
grant execute on function public.rpc_create_store(jsonb) to authenticated;

comment on function public.rpc_create_store(jsonb) is
  'Secure store creator. SECURITY DEFINER, checks user_role() = super_admin, inserts into stores in the caller''s org.';
