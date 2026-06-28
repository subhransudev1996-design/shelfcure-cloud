-- ShelfCure Cloud — Migration 0071
-- AI purchase-bill scanning (Gemini 2.5 Flash): adds a per-org monthly scan
-- quota, configurable per billing tier, alongside the existing max_stores /
-- max_staff capacity limits (migration 0064/0065). Unlike those two, a scan
-- quota is *consumable* (resets every calendar month) rather than a static
-- ceiling, so it needs its own usage-log table instead of a simple row count.
--
-- One row is written to ai_scan_usage per SUCCESSFUL scan only — a failed or
-- garbage scan (bad image, Gemini error, unparseable JSON) must not cost the
-- org a credit, mirroring the desktop app's "only deduct on success" rule.

-- ============================================================================
-- 1) billing_tiers.max_ai_scans_per_month
-- ============================================================================

alter table public.billing_tiers
  add column if not exists max_ai_scans_per_month integer
    check (max_ai_scans_per_month is null or max_ai_scans_per_month > 0);

comment on column public.billing_tiers.max_ai_scans_per_month is
  'Max AI purchase-bill scans (Gemini) an org on this tier may run per calendar month. NULL = unlimited.';

-- ============================================================================
-- 2) ai_scan_usage — one row per successful scan.
-- ============================================================================

create table public.ai_scan_usage (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  created_by  uuid references public.user_profiles(id) on delete set null,
  client_uuid uuid not null unique,
  created_at  timestamptz not null default now()
);

create index ai_scan_usage_org_month_idx on public.ai_scan_usage (org_id, created_at);

comment on table public.ai_scan_usage is
  'One row per successful AI purchase-bill scan. Summed per calendar month against billing_tiers.max_ai_scans_per_month by rpc_check_ai_scan_quota/rpc_record_ai_scan_usage. No direct table grants — read/write only via those security definer RPCs.';

alter table public.ai_scan_usage enable row level security;

-- ============================================================================
-- 3) rpc_check_ai_scan_quota — read-only pre-check (called before spending
--    any Gemini API cost). Returns allowed=false rather than raising, so the
--    Edge Function can surface a clean "out of scans" message.
-- ============================================================================

create function public.rpc_check_ai_scan_quota(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_limit   integer;
  v_used    bigint;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.user_role() not in ('super_admin', 'store_admin', 'pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_org_id := public.current_org();

  select t.max_ai_scans_per_month into v_limit
  from public.organizations o
  join public.billing_tiers t on t.id = o.billing_tier_id
  where o.id = v_org_id;

  select count(*) into v_used
  from public.ai_scan_usage
  where org_id = v_org_id and created_at >= date_trunc('month', now());

  if v_limit is null then
    return jsonb_build_object('allowed', true, 'used', v_used, 'limit', null, 'remaining', null);
  end if;

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used)
  );
end;
$$;

comment on function public.rpc_check_ai_scan_quota(uuid) is
  'Read-only AI-scan quota check for the calling user''s org/store. Returns {allowed, used, limit, remaining} — does not raise on quota-exceeded so the Edge Function can show a clean message before calling Gemini. An org with no billing tier (or a tier with no limit set) is unlimited.';

revoke all on function public.rpc_check_ai_scan_quota(uuid) from public;
grant execute on function public.rpc_check_ai_scan_quota(uuid) to authenticated;

-- ============================================================================
-- 4) rpc_record_ai_scan_usage — called only after a successful Gemini scan.
-- ============================================================================

create function public.rpc_record_ai_scan_usage(p_store_id uuid, p_client_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_limit   integer;
  v_used    bigint;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.user_role() not in ('super_admin', 'store_admin', 'pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;

  v_org_id := public.current_org();

  insert into public.ai_scan_usage (org_id, store_id, created_by, client_uuid)
  values (v_org_id, p_store_id, v_user_id, p_client_uuid)
  on conflict (client_uuid) do nothing;

  select t.max_ai_scans_per_month into v_limit
  from public.organizations o
  join public.billing_tiers t on t.id = o.billing_tier_id
  where o.id = v_org_id;

  select count(*) into v_used
  from public.ai_scan_usage
  where org_id = v_org_id and created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', case when v_limit is null then null else greatest(0, v_limit - v_used) end
  );
end;
$$;

comment on function public.rpc_record_ai_scan_usage(uuid, uuid) is
  'Consumes one AI-scan quota credit for the calling user''s org. Idempotent via p_client_uuid (a repeat call with the same uuid does not double-count). Call only after a scan has actually succeeded.';

revoke all on function public.rpc_record_ai_scan_usage(uuid, uuid) from public;
grant execute on function public.rpc_record_ai_scan_usage(uuid, uuid) to authenticated;

-- ============================================================================
-- 5) Console tier RPCs — add max_ai_scans_per_month alongside max_stores/max_staff.
-- ============================================================================

drop function if exists public.rpc_console_list_billing_tiers();

create function public.rpc_console_list_billing_tiers()
returns table (
  id                       uuid,
  name                     text,
  slug                     text,
  description              text,
  is_active                boolean,
  is_default               boolean,
  sort_order               integer,
  trial_days               integer,
  monthly_price_paise      integer,
  yearly_price_paise       integer,
  razorpay_plan_id_monthly text,
  razorpay_plan_id_yearly  text,
  max_stores               integer,
  max_staff                integer,
  max_ai_scans_per_month   integer,
  features                 jsonb,
  org_count                bigint,
  created_at               timestamptz,
  updated_at               timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  return query
    select
      t.id, t.name, t.slug, t.description, t.is_active, t.is_default, t.sort_order,
      t.trial_days, t.monthly_price_paise, t.yearly_price_paise,
      t.razorpay_plan_id_monthly, t.razorpay_plan_id_yearly, t.max_stores, t.max_staff,
      t.max_ai_scans_per_month,
      t.features,
      (select count(*) from public.organizations o where o.billing_tier_id = t.id),
      t.created_at, t.updated_at
    from public.billing_tiers t
    order by t.sort_order, t.name;
end;
$$;

comment on function public.rpc_console_list_billing_tiers() is
  'Platform-admin-only: every billing tier with its current org_count, for the Console Tier Management page and every tier-picker dropdown.';

revoke all on function public.rpc_console_list_billing_tiers() from public;
grant execute on function public.rpc_console_list_billing_tiers() to authenticated;

create or replace function public.rpc_console_create_billing_tier(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_new  public.billing_tiers;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if not (p_payload ? 'name') or length(trim(p_payload->>'name')) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_slug := lower(regexp_replace(trim(coalesce(p_payload->>'slug', p_payload->>'name')), '[^a-z0-9]+', '-', 'gi'));
  v_slug := trim(v_slug, '-');
  if v_slug = '' or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  if (p_payload->>'trial_days') is not null and (p_payload->>'trial_days')::integer < 0 then
    raise exception 'invalid_trial_days' using errcode = '22023';
  end if;

  -- Only one default tier at a time — unset any existing default first.
  if coalesce((p_payload->>'is_default')::boolean, false) then
    update public.billing_tiers set is_default = false where is_default;
  end if;

  insert into public.billing_tiers (
    name, slug, description, is_active, is_default, sort_order, trial_days,
    monthly_price_paise, yearly_price_paise, max_stores, max_staff, max_ai_scans_per_month, features
  ) values (
    trim(p_payload->>'name'),
    v_slug,
    coalesce(p_payload->>'description', ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    coalesce((p_payload->>'is_default')::boolean, false),
    coalesce((p_payload->>'sort_order')::integer, 0),
    coalesce((p_payload->>'trial_days')::integer, 14),
    (p_payload->>'monthly_price_paise')::integer,
    (p_payload->>'yearly_price_paise')::integer,
    (p_payload->>'max_stores')::integer,
    (p_payload->>'max_staff')::integer,
    (p_payload->>'max_ai_scans_per_month')::integer,
    coalesce(p_payload->'features', '{}'::jsonb)
  )
  returning * into v_new;

  return to_jsonb(v_new);
end;
$$;

comment on function public.rpc_console_create_billing_tier(jsonb) is
  'Platform-admin-only: creates a new billing tier. slug auto-derives from name if not given. Setting is_default=true unsets any previous default (at most one default tier).';

revoke all on function public.rpc_console_create_billing_tier(jsonb) from public;
grant execute on function public.rpc_console_create_billing_tier(jsonb) to authenticated;

create or replace function public.rpc_console_update_billing_tier(p_tier_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.billing_tiers;
  v_after  public.billing_tiers;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_target from public.billing_tiers where id = p_tier_id;
  if v_target.id is null then
    raise exception 'not_found: billing tier' using errcode = 'P0002';
  end if;

  if p_payload ? 'name' and length(trim(p_payload->>'name')) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_payload ? 'trial_days' and (p_payload->>'trial_days')::integer < 0 then
    raise exception 'invalid_trial_days' using errcode = '22023';
  end if;

  if coalesce((p_payload->>'is_default')::boolean, false) then
    update public.billing_tiers set is_default = false where is_default and id <> p_tier_id;
  end if;

  update public.billing_tiers set
    name                     = coalesce(nullif(trim(p_payload->>'name'), ''), name),
    description              = case when p_payload ? 'description' then coalesce(p_payload->>'description', '') else description end,
    is_active                = case when p_payload ? 'is_active' then (p_payload->>'is_active')::boolean else is_active end,
    is_default               = case when p_payload ? 'is_default' then (p_payload->>'is_default')::boolean else is_default end,
    sort_order               = case when p_payload ? 'sort_order' then (p_payload->>'sort_order')::integer else sort_order end,
    trial_days               = case when p_payload ? 'trial_days' then (p_payload->>'trial_days')::integer else trial_days end,
    monthly_price_paise      = case when p_payload ? 'monthly_price_paise' then (p_payload->>'monthly_price_paise')::integer else monthly_price_paise end,
    yearly_price_paise       = case when p_payload ? 'yearly_price_paise' then (p_payload->>'yearly_price_paise')::integer else yearly_price_paise end,
    razorpay_plan_id_monthly = case when p_payload ? 'razorpay_plan_id_monthly' then nullif(p_payload->>'razorpay_plan_id_monthly', '') else razorpay_plan_id_monthly end,
    razorpay_plan_id_yearly  = case when p_payload ? 'razorpay_plan_id_yearly' then nullif(p_payload->>'razorpay_plan_id_yearly', '') else razorpay_plan_id_yearly end,
    max_stores               = case when p_payload ? 'max_stores' then (p_payload->>'max_stores')::integer else max_stores end,
    max_staff                = case when p_payload ? 'max_staff' then (p_payload->>'max_staff')::integer else max_staff end,
    max_ai_scans_per_month   = case when p_payload ? 'max_ai_scans_per_month' then (p_payload->>'max_ai_scans_per_month')::integer else max_ai_scans_per_month end,
    features                 = case when p_payload ? 'features' then p_payload->'features' else features end
  where id = p_tier_id
  returning * into v_after;

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_console_update_billing_tier(uuid, jsonb) is
  'Platform-admin-only partial update of a billing tier. Setting is_default=true unsets any other default tier.';

revoke all on function public.rpc_console_update_billing_tier(uuid, jsonb) from public;
grant execute on function public.rpc_console_update_billing_tier(uuid, jsonb) to authenticated;
