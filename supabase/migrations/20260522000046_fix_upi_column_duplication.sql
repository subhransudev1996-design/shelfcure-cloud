-- ShelfCure Cloud — Migration 0046
-- Fix: migration 0045 added stores.upi_id, duplicating the upi_vpa column
-- already shipped in migration 0026 (POS Phase D / rpc_update_store_upi).
-- Drop the duplicate and rename organizations.upi_id -> upi_vpa for naming
-- consistency, then point rpc_update_store_settings / rpc_update_org_settings
-- at the single upi_vpa column.

alter table public.stores drop column if exists upi_id;

alter table public.organizations rename column upi_id to upi_vpa;

alter table public.organizations
  add constraint organizations_upi_vpa_check
  check (upi_vpa is null or upi_vpa ~ '^[A-Za-z0-9._\-]+@[A-Za-z0-9.\-]+$');

comment on column public.organizations.upi_vpa is
  'Org-level default UPI ID (VPA). Stores inherit this when stores.upi_vpa is null.';

-- ============================================================================
-- rpc_update_store_settings — swap upi_id for upi_vpa in the payload allow-list.
-- ============================================================================

create or replace function public.rpc_update_store_settings(
  p_store_id uuid,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org           uuid := public.current_org();
  v_role          text := public.user_role();
  v_caller_store  uuid := public.current_store();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  if v_role = 'super_admin' then
    -- ok
  elsif v_role = 'store_admin' and v_caller_store = p_store_id then
    -- ok
  else
    raise exception 'permission_denied: cannot edit this store' using errcode = '42501';
  end if;

  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'invalid_store_id' using errcode = '23503';
  end if;

  update public.stores
  set
    name            = coalesce(nullif(trim(p_payload->>'name'),''), name),
    gstin           = case when p_payload ? 'gstin'
                        then nullif(trim(p_payload->>'gstin'),'')
                        else gstin end,
    drug_license_no = case when p_payload ? 'drug_license_no'
                        then nullif(trim(p_payload->>'drug_license_no'),'')
                        else drug_license_no end,
    address         = coalesce(p_payload->>'address', address),
    city            = coalesce(p_payload->>'city', city),
    state           = coalesce(p_payload->>'state', state),
    pincode         = coalesce(p_payload->>'pincode', pincode),
    phone           = coalesce(p_payload->>'phone', phone),
    email           = coalesce(p_payload->>'email', email),
    owner_name      = coalesce(p_payload->>'owner_name', owner_name),
    gst_scheme      = coalesce(p_payload->>'gst_scheme', gst_scheme),
    gst_filing_type = coalesce(p_payload->>'gst_filing_type', gst_filing_type),
    idle_lock_minutes = case when p_payload ? 'idle_lock_minutes'
                          then (p_payload->>'idle_lock_minutes')::integer
                          else idle_lock_minutes end,
    is_active       = case when p_payload ? 'is_active'
                          then (p_payload->>'is_active')::boolean
                          else is_active end,
    enable_gst_calculation = case when p_payload ? 'enable_gst_calculation'
                          then (p_payload->>'enable_gst_calculation')::boolean
                          else enable_gst_calculation end,
    upi_vpa         = case when p_payload ? 'upi_vpa'
                        then nullif(trim(p_payload->>'upi_vpa'),'')
                        else upi_vpa end,
    logo_url        = case when p_payload ? 'logo_url'
                        then nullif(trim(p_payload->>'logo_url'),'')
                        else logo_url end,
    near_expiry_alert_days = case when p_payload ? 'near_expiry_alert_days'
                          then (p_payload->>'near_expiry_alert_days')::integer
                          else near_expiry_alert_days end,
    low_stock_threshold = case when p_payload ? 'low_stock_threshold'
                          then (p_payload->>'low_stock_threshold')::integer
                          else low_stock_threshold end
  where id = p_store_id;

  return to_jsonb(s.*) from public.stores s where s.id = p_store_id;
end;
$$;

revoke all on function public.rpc_update_store_settings(uuid, jsonb) from public;
grant execute on function public.rpc_update_store_settings(uuid, jsonb) to authenticated;

-- ============================================================================
-- rpc_update_org_settings — swap upi_id for upi_vpa.
-- ============================================================================

create or replace function public.rpc_update_org_settings(p_payload jsonb)
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
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can change org settings' using errcode = '42501';
  end if;

  update public.organizations
  set
    name                   = coalesce(nullif(trim(p_payload->>'name'),''), name),
    legal_name             = coalesce(p_payload->>'legal_name', legal_name),
    gstin_default          = case
                               when p_payload ? 'gstin_default'
                                 then nullif(trim(p_payload->>'gstin_default'),'')
                               else gstin_default
                             end,
    shared_masters_enabled = case
                               when p_payload ? 'shared_masters_enabled'
                                 then (p_payload->>'shared_masters_enabled')::boolean
                               else shared_masters_enabled
                             end,
    upi_vpa                = case
                               when p_payload ? 'upi_vpa'
                                 then nullif(trim(p_payload->>'upi_vpa'),'')
                               else upi_vpa
                             end
  where id = v_org;

  return to_jsonb(o.*) from public.organizations o where o.id = v_org;
end;
$$;

revoke all on function public.rpc_update_org_settings(jsonb) from public;
grant execute on function public.rpc_update_org_settings(jsonb) to authenticated;
