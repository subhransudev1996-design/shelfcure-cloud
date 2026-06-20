-- ShelfCure Cloud — Migration 0061
-- ShelfCure Console, Phase 3 (ADR-0018): license management. Makes
-- organizations.plan_tier / billing_status / trial_ends_at editable by a
-- platform admin from one place, with an audit trail. Does NOT make them
-- enforced — that's Phase 4, alongside real Razorpay billing.
--
-- Audit trail note: the existing log_audit() helper inserts user_id =
-- auth.uid() directly, but audit_log.user_id references user_profiles(id) —
-- a platform admin is deliberately NOT a user_profiles row (ADR-0018), so
-- calling log_audit() here would violate that FK. We write to audit_log
-- directly instead, with user_id = null and the platform admin's id embedded
-- in the `after` payload — fully traceable, no schema change needed.

create or replace function public.rpc_console_update_org_license(
  p_org_id  uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_before   public.organizations;
  v_after    public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_before from public.organizations where id = p_org_id;
  if v_before.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  if p_payload ? 'plan_tier' and p_payload->>'plan_tier' not in ('solo','team','chain','enterprise') then
    raise exception 'invalid_plan_tier: %', p_payload->>'plan_tier' using errcode = '22023';
  end if;

  if p_payload ? 'billing_status'
     and p_payload->>'billing_status' not in ('trial','active','past_due','cancelled','expired') then
    raise exception 'invalid_billing_status: %', p_payload->>'billing_status' using errcode = '22023';
  end if;

  update public.organizations
  set
    plan_tier      = case when p_payload ? 'plan_tier' then p_payload->>'plan_tier' else plan_tier end,
    billing_status = case when p_payload ? 'billing_status' then p_payload->>'billing_status' else billing_status end,
    trial_ends_at  = case when p_payload ? 'trial_ends_at'
                       then nullif(p_payload->>'trial_ends_at','')::timestamptz
                       else trial_ends_at end
  where id = p_org_id
  returning * into v_after;

  insert into public.audit_log (org_id, store_id, user_id, entity, entity_id, action, before, after)
  values (
    p_org_id,
    null,
    null,
    'organizations',
    p_org_id::text,
    'update',
    to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object('_platform_admin_id', v_admin_id)
  );

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_console_update_org_license(uuid, jsonb) is
  'Platform-admin-only partial update of an org''s plan_tier/billing_status/trial_ends_at (ADR-0018 Phase 3). Editable but not yet enforced — Phase 4 wires up real enforcement. Audited via audit_log with the platform admin''s id embedded in `after` (user_id stays null since platform admins are not a user_profiles row).';

revoke all on function public.rpc_console_update_org_license(uuid, jsonb) from public;
grant execute on function public.rpc_console_update_org_license(uuid, jsonb) to authenticated;
