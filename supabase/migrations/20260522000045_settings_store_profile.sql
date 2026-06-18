-- ShelfCure Cloud — Migration 0045
-- Phase 2.13.1: Store Profile & GST extensions.
-- Adds enable_gst_calculation, upi_id, logo_url, near_expiry_alert_days,
-- low_stock_threshold to stores; org-level upi_id default; store-logos bucket.

alter table public.stores
  add column if not exists enable_gst_calculation boolean not null default true,
  add column if not exists upi_id text,
  add column if not exists logo_url text,
  add column if not exists near_expiry_alert_days integer not null default 30,
  add column if not exists low_stock_threshold integer not null default 10;

alter table public.organizations
  add column if not exists upi_id text;

-- ============================================================================
-- rpc_update_store_settings — extend payload allow-list with the new fields.
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
    upi_id          = case when p_payload ? 'upi_id'
                        then nullif(trim(p_payload->>'upi_id'),'')
                        else upi_id end,
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
-- rpc_update_org_settings — extend with org-level upi_id default.
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
    upi_id                 = case
                               when p_payload ? 'upi_id'
                                 then nullif(trim(p_payload->>'upi_id'),'')
                               else upi_id
                             end
  where id = v_org;

  return to_jsonb(o.*) from public.organizations o where o.id = v_org;
end;
$$;

revoke all on function public.rpc_update_org_settings(jsonb) from public;
grant execute on function public.rpc_update_org_settings(jsonb) to authenticated;

-- ============================================================================
-- Storage bucket: store-logos — public read (logos appear on bills/promotions),
-- writes scoped to org members, deletes scoped to admins.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('store-logos', 'store-logos', true)
on conflict (id) do nothing;

drop policy if exists "store_logos_select_public" on storage.objects;
drop policy if exists "store_logos_insert_org_members" on storage.objects;
drop policy if exists "store_logos_update_org_members" on storage.objects;
drop policy if exists "store_logos_delete_org_admin" on storage.objects;

create policy "store_logos_select_public"
on storage.objects for select
to public
using (bucket_id = 'store-logos');

create policy "store_logos_insert_org_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1]::uuid = public.current_org()
);

create policy "store_logos_update_org_members"
on storage.objects for update
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1]::uuid = public.current_org()
);

create policy "store_logos_delete_org_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1]::uuid = public.current_org()
  and public.user_role() in ('super_admin','store_admin')
);
