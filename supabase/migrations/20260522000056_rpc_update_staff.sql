-- ShelfCure Cloud — Migration 0056
-- rpc_update_staff: super_admin-only edit of an existing user_profiles row
-- (full_name, phone, role, store_id, is_active), reusing the jsonb partial-update
-- pattern from rpc_update_store_settings / rpc_update_org_settings.
--
-- Why a new RPC when the user_profiles_update_super_admin RLS policy already lets
-- super_admin UPDATE any row in their org?
--   That policy (migration 0001/0010) has no `with check` clause at all — RLS alone
--   would let a super_admin demote/deactivate ANOTHER super_admin, edit themselves,
--   or set role+store_id into a combination that violates user_profiles_scope_matches_role
--   (raising an unfriendly raw constraint error instead of a clear message). This RPC
--   centralises those guards, SECURITY DEFINER, matching every other mutating RPC here.

create or replace function public.rpc_update_staff(
  p_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text := public.user_role();
  v_org_id      uuid := public.current_org();
  v_target      public.user_profiles;
  v_new_role    text;
  v_new_store   uuid;
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  -- Phase 2 scope: super_admin only. store_admin self-service editing of their own
  -- store's pharmacist/cashier rows is an intentionally deferred extension.
  if v_caller_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can edit staff' using errcode = '42501';
  end if;

  -- Cannot edit your own profile through this RPC. Self full_name/phone edits go
  -- through rpc_update_my_profile; self role/store changes are independently
  -- blocked by the user_profiles_update_self RLS policy's with-check clause.
  if p_user_id = v_caller_id then
    raise exception 'cannot_edit_self' using errcode = '42501';
  end if;

  -- Load target row scoped to caller's org. Wrong org and nonexistent row are
  -- intentionally indistinguishable to the caller.
  select * into v_target
  from public.user_profiles
  where id = p_user_id and org_id = v_org_id;

  if v_target.id is null then
    raise exception 'not_found: staff member' using errcode = 'P0002';
  end if;

  -- Never allow editing another super_admin through this RPC (covers deactivation,
  -- role change, and plain field edits) — checked on the target's CURRENT role.
  if v_target.role = 'super_admin' then
    raise exception 'cannot_edit_super_admin' using errcode = '42501';
  end if;

  -- Reject promotion to super_admin and any other unrecognised role.
  if p_payload ? 'role' then
    if p_payload->>'role' = 'super_admin' then
      raise exception 'invalid_role: super_admin' using errcode = '22023';
    end if;
    if p_payload->>'role' not in ('store_admin','pharmacist','cashier','accountant') then
      raise exception 'invalid_role: %', p_payload->>'role' using errcode = '22023';
    end if;
  end if;

  -- Compute the EFFECTIVE post-update role/store_id (payload value if present,
  -- else the row's current value), then validate the resulting combination — this
  -- covers "store_id changed but role didn't" too, not just whichever key is present.
  v_new_role  := coalesce(p_payload->>'role', v_target.role);
  v_new_store := case
                   when p_payload ? 'store_id' then nullif(p_payload->>'store_id','')::uuid
                   else v_target.store_id
                 end;

  if v_new_role in ('store_admin','pharmacist','cashier') then
    if v_new_store is null then
      raise exception 'store_required_for_role: %', v_new_role using errcode = '23502';
    end if;
    if not exists (select 1 from public.stores where id = v_new_store and org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  elsif v_new_role = 'accountant' then
    v_new_store := null; -- accountant is always org-wide; mirrors rpc_finalize_staff_profile
  end if;

  update public.user_profiles
  set
    full_name = coalesce(nullif(trim(p_payload->>'full_name'),''), full_name),
    phone     = case when p_payload ? 'phone'
                  then nullif(trim(p_payload->>'phone'),'')
                  else phone end,
    role      = v_new_role,
    store_id  = v_new_store,
    is_active = case when p_payload ? 'is_active'
                  then (p_payload->>'is_active')::boolean
                  else is_active end
  where id = p_user_id and org_id = v_org_id;

  return (to_jsonb(p.*) - 'pin_hash')
  from public.user_profiles p
  where p.id = p_user_id;
end;
$$;

comment on function public.rpc_update_staff(uuid, jsonb) is
  'super_admin-only partial update of a staff user_profiles row (full_name, phone, role, store_id, is_active). Refuses self-edits and refuses to touch other super_admin rows. Never allows promotion to super_admin.';

revoke all on function public.rpc_update_staff(uuid, jsonb) from public;
grant execute on function public.rpc_update_staff(uuid, jsonb) to authenticated;
