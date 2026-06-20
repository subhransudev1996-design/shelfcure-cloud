-- ShelfCure Cloud — Migration 0060
-- ShelfCure Console, Phase 2 (ADR-0018): manual org creation. Lets a platform
-- admin hand-create a new organization + its owner account, for
-- sales-assisted onboarding (Chain/Enterprise deals ADR-0006 already routes
-- to a "book a call" flow instead of self-serve signup).
--
-- This mirrors rpc_create_org_with_owner (migration 0001) exactly, just
-- callable by a platform admin on someone else's behalf instead of by the new
-- owner themselves, and able to start above plan_tier='solo' for sales-led
-- deals. Self-serve signup is untouched and stays the primary path for
-- Solo/Team customers.

create or replace function public.rpc_console_create_org(
  p_owner_user_id   uuid,
  p_org_name        text,
  p_owner_full_name text,
  p_owner_email     text,
  p_owner_phone     text default null,
  p_plan_tier       text default 'solo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id     uuid;
  v_profile_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if p_plan_tier not in ('solo', 'team', 'chain', 'enterprise') then
    raise exception 'invalid_plan_tier: %', p_plan_tier using errcode = '22023';
  end if;

  if exists (select 1 from public.user_profiles where id = p_owner_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  insert into public.organizations (name, plan_tier, billing_status, trial_ends_at)
  values (p_org_name, p_plan_tier, 'trial', now() + interval '14 days')
  returning id into v_org_id;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (p_owner_user_id, v_org_id, null, p_owner_full_name, p_owner_email, p_owner_phone, 'super_admin')
  returning id into v_profile_id;

  return jsonb_build_object('org_id', v_org_id, 'profile_id', v_profile_id);
end;
$$;

comment on function public.rpc_console_create_org(uuid, text, text, text, text, text) is
  'Platform-admin-only: hand-creates an organization + its super_admin owner, for sales-assisted onboarding. Mirrors rpc_create_org_with_owner but invoked by Console on the owner''s behalf, and can start above plan_tier=solo.';

revoke all on function public.rpc_console_create_org(uuid, text, text, text, text, text) from public;
grant execute on function public.rpc_console_create_org(uuid, text, text, text, text, text) to authenticated;
