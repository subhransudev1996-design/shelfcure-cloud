-- ShelfCure Cloud — Migration 0064
-- ShelfCure Console: fully dynamic billing tiers, replacing the hardcoded
-- plan_tier enum ('solo'/'team'/'chain'/'enterprise') as the source of truth
-- for pricing, trials, and access. A platform admin can now create/edit/
-- delete tiers from the Console (name, monthly/yearly price, default trial
-- length, numeric limits, feature toggles) instead of every tier being baked
-- into a `check` constraint.
--
-- organizations.plan_tier (text, check constraint, default 'solo') is left
-- entirely in place — dropping it would break the NOT NULL guarantee and
-- every existing row with no migration path, since tiers intentionally start
-- empty (no seed data). It now means "legacy plan label, pre-dynamic-tiers"
-- and is no longer written by any Console flow going forward. The new
-- `billing_tier_id` column is the authoritative reference; nullable, because
-- an org can legitimately have no tier yet (a fresh deploy before any tier
-- is created, or an existing org not yet reassigned). Every consumer (apps/
-- web enforcement, Console display) treats a null tier as "ungoverned" —
-- unlimited, all features on — so nothing already working breaks.
--
-- billing_plans (migration 0062/0063) is dropped — pricing now lives
-- directly on billing_tiers (one row per tier covers both monthly and yearly
-- price + Razorpay plan id), so there's exactly one place to manage "tiers,
-- pricing, trials, and everything" instead of two tables that needed to stay
-- in sync.

-- ============================================================================
-- 1) billing_tiers — the dynamic tier catalog.
-- ============================================================================

create table public.billing_tiers (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(trim(name)) between 2 and 60),
  slug                     text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  description              text not null default '',
  is_active                boolean not null default true,
  is_default               boolean not null default false,
  sort_order               integer not null default 0,
  trial_days               integer not null default 14 check (trial_days >= 0),
  monthly_price_paise      integer check (monthly_price_paise is null or monthly_price_paise >= 0),
  yearly_price_paise       integer check (yearly_price_paise is null or yearly_price_paise >= 0),
  razorpay_plan_id_monthly text,
  razorpay_plan_id_yearly  text,
  max_stores               integer check (max_stores is null or max_stores > 0),
  max_staff                 integer check (max_staff is null or max_staff > 0),
  features                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (slug)
);

comment on table public.billing_tiers is
  'Fully admin-managed tier catalog (ADR-0018 Console extension): name, monthly/yearly pricing, default trial length, numeric limits (max_stores/max_staff, null = unlimited), and a feature-toggle jsonb map. Replaces the hardcoded plan_tier enum as the source of truth. Readable by any authenticated user (apps/web/apps/admin need to read their own org''s limits/features); writes are RPC-only (platform-admin gated).';
comment on column public.billing_tiers.features is
  'Toggle map keyed by a fixed registry of feature keys defined in code (e.g. {"advanced_reports": true}) — the set of possible keys is bounded by what apps/web actually checks, but which tier grants which key is fully admin-configurable here.';
comment on column public.billing_tiers.max_stores is
  'Max active stores an org on this tier may create. NULL = unlimited.';
comment on column public.billing_tiers.max_staff is
  'Max active staff (user_profiles rows, excluding the org owner) an org on this tier may create. NULL = unlimited.';

create unique index billing_tiers_one_default_idx on public.billing_tiers (is_default) where is_default;
create index billing_tiers_sort_idx on public.billing_tiers (sort_order, name);

create trigger trg_billing_tiers_updated_at
  before update on public.billing_tiers
  for each row execute function public.tg_set_updated_at();

alter table public.billing_tiers enable row level security;

-- Read is broad (authenticated only) — tier limits/features/pricing are not
-- sensitive (a pricing+feature matrix any logged-in org member can see for
-- their own plan), and apps/web needs to read this to self-enforce limits.
-- Writes are RPC-only (platform-admin gated) — no insert/update/delete policy.
create policy billing_tiers_select_authenticated on public.billing_tiers
  for select using (true);

revoke all on public.billing_tiers from public;
grant select on public.billing_tiers to authenticated;

-- ============================================================================
-- 2) organizations.billing_tier_id — the authoritative tier reference.
-- ============================================================================

alter table public.organizations
  add column billing_tier_id uuid references public.billing_tiers(id) on delete restrict;

comment on column public.organizations.billing_tier_id is
  'Authoritative dynamic tier reference (replaces plan_tier going forward). NULL = ungoverned (no limits/feature restrictions enforced) — covers orgs created before any tier existed. on delete restrict: a tier in use cannot be deleted, only deactivated.';

-- ============================================================================
-- 3) billing_invoices — record which tier was active at time of payment.
-- ============================================================================

alter table public.billing_invoices
  add column billing_tier_id uuid references public.billing_tiers(id) on delete set null,
  add column tier_name_snapshot text;

comment on column public.billing_invoices.tier_name_snapshot is
  'Tier name captured at payment time, so invoice history stays readable even if the tier is later renamed or deleted (billing_tier_id set null on delete).';

-- ============================================================================
-- 4) Drop billing_plans (migration 0062/0063) — folded into billing_tiers.
-- ============================================================================

drop function if exists public.rpc_console_list_billing_plans();
drop table public.billing_plans;

-- ============================================================================
-- 5) rpc_console_list_billing_tiers — Tier Management page + tier pickers.
-- ============================================================================

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

-- ============================================================================
-- 6) rpc_console_create_billing_tier
-- ============================================================================

create function public.rpc_console_create_billing_tier(p_payload jsonb)
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
    monthly_price_paise, yearly_price_paise, max_stores, max_staff, features
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

-- ============================================================================
-- 7) rpc_console_update_billing_tier — jsonb partial update.
-- ============================================================================

create function public.rpc_console_update_billing_tier(p_tier_id uuid, p_payload jsonb)
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

-- ============================================================================
-- 8) rpc_console_delete_billing_tier — blocked while any org is on the tier.
-- ============================================================================

create function public.rpc_console_delete_billing_tier(p_tier_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_count bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.billing_tiers where id = p_tier_id) then
    raise exception 'not_found: billing tier' using errcode = 'P0002';
  end if;

  select count(*) into v_org_count from public.organizations where billing_tier_id = p_tier_id;
  if v_org_count > 0 then
    raise exception 'tier_in_use: % organization(s) are on this tier — reassign or deactivate instead', v_org_count
      using errcode = '23503';
  end if;

  delete from public.billing_tiers where id = p_tier_id;
end;
$$;

comment on function public.rpc_console_delete_billing_tier(uuid) is
  'Platform-admin-only: deletes a billing tier. Blocked (tier_in_use) while any organization still references it — deactivate (is_active=false) instead, or reassign those orgs first.';

revoke all on function public.rpc_console_delete_billing_tier(uuid) from public;
grant execute on function public.rpc_console_delete_billing_tier(uuid) to authenticated;

-- ============================================================================
-- 9) rpc_console_create_org — switch from p_plan_tier enum to p_billing_tier_id.
-- ============================================================================

drop function if exists public.rpc_console_create_org(uuid, text, text, text, text, text, integer);

create function public.rpc_console_create_org(
  p_owner_user_id   uuid,
  p_org_name        text,
  p_owner_full_name text,
  p_owner_email     text,
  p_owner_phone     text default null,
  p_billing_tier_id uuid default null,
  p_trial_days      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id     uuid;
  v_profile_id uuid;
  v_tier       public.billing_tiers;
  v_days       integer;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if p_billing_tier_id is not null then
    select * into v_tier from public.billing_tiers where id = p_billing_tier_id;
    if v_tier.id is null then
      raise exception 'not_found: billing tier' using errcode = 'P0002';
    end if;
  end if;

  if p_trial_days is not null and p_trial_days < 0 then
    raise exception 'invalid_trial_days: %', p_trial_days using errcode = '22023';
  end if;

  v_days := coalesce(p_trial_days, v_tier.trial_days, 14);

  if exists (select 1 from public.user_profiles where id = p_owner_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  insert into public.organizations (name, billing_tier_id, billing_status, trial_ends_at)
  values (p_org_name, p_billing_tier_id, 'trial', now() + (v_days || ' days')::interval)
  returning id into v_org_id;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (p_owner_user_id, v_org_id, null, p_owner_full_name, p_owner_email, p_owner_phone, 'super_admin')
  returning id into v_profile_id;

  return jsonb_build_object('org_id', v_org_id, 'profile_id', v_profile_id);
end;
$$;

comment on function public.rpc_console_create_org(uuid, text, text, text, text, uuid, integer) is
  'Platform-admin-only: hand-creates an organization + its super_admin owner, for sales-assisted onboarding. p_billing_tier_id picks a dynamic tier (nullable — ungoverned if omitted); p_trial_days overrides the tier''s own trial_days when given.';

revoke all on function public.rpc_console_create_org(uuid, text, text, text, text, uuid, integer) from public;
grant execute on function public.rpc_console_create_org(uuid, text, text, text, text, uuid, integer) to authenticated;

-- ============================================================================
-- 10) rpc_console_update_org_license — payload key plan_tier -> billing_tier_id.
-- ============================================================================

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

  if p_payload ? 'billing_tier_id'
     and p_payload->>'billing_tier_id' is not null
     and not exists (select 1 from public.billing_tiers where id = (p_payload->>'billing_tier_id')::uuid) then
    raise exception 'not_found: billing tier' using errcode = 'P0002';
  end if;

  if p_payload ? 'billing_status'
     and p_payload->>'billing_status' not in ('trial','active','past_due','cancelled','expired') then
    raise exception 'invalid_billing_status: %', p_payload->>'billing_status' using errcode = '22023';
  end if;

  update public.organizations
  set
    billing_tier_id = case when p_payload ? 'billing_tier_id'
                         then nullif(p_payload->>'billing_tier_id','')::uuid
                         else billing_tier_id end,
    billing_status = case when p_payload ? 'billing_status' then p_payload->>'billing_status' else billing_status end,
    trial_ends_at  = case when p_payload ? 'trial_ends_at'
                       then nullif(p_payload->>'trial_ends_at','')::timestamptz
                       else trial_ends_at end
  where id = p_org_id
  returning * into v_after;

  insert into public.audit_log (org_id, store_id, user_id, entity, entity_id, action, before, after)
  values (
    p_org_id, null, null, 'organizations', p_org_id::text, 'update',
    to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object('_platform_admin_id', v_admin_id)
  );

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_console_update_org_license(uuid, jsonb) is
  'Platform-admin-only partial update of an org''s billing_tier_id/billing_status/trial_ends_at. Editable; billing_tier_id drives limit/feature enforcement in apps/web. Audited via audit_log with the platform admin''s id embedded in `after`.';

-- ============================================================================
-- 11) rpc_console_record_manual_payment — p_plan_tier -> p_billing_tier_id.
-- ============================================================================

drop function if exists public.rpc_console_record_manual_payment(uuid, text, text, integer, text, date, text, uuid);

create function public.rpc_console_record_manual_payment(
  p_org_id          uuid,
  p_billing_tier_id uuid,
  p_billing_cycle   text,
  p_amount_paise    integer,
  p_payment_method  text,
  p_payment_date    date    default current_date,
  p_notes           text    default null,
  p_client_uuid     uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id    uuid := auth.uid();
  v_before      public.organizations;
  v_after       public.organizations;
  v_tier        public.billing_tiers;
  v_subtotal    integer;
  v_gst         integer;
  v_invoice_id  uuid;
  v_existing    public.billing_invoices;
  v_valid_until timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  -- Idempotency: a retried submit with the same client_uuid returns the
  -- existing result instead of double-activating.
  if p_client_uuid is not null then
    select * into v_existing from public.billing_invoices where client_uuid = p_client_uuid;
    if v_existing.id is not null then
      return jsonb_build_object('org_id', p_org_id, 'invoice_id', v_existing.id);
    end if;
  end if;

  select * into v_tier from public.billing_tiers where id = p_billing_tier_id;
  if v_tier.id is null then
    raise exception 'not_found: billing tier' using errcode = 'P0002';
  end if;
  if p_billing_cycle not in ('monthly','yearly') then
    raise exception 'invalid_billing_cycle' using errcode = '22023';
  end if;
  if p_payment_method not in ('cash','upi','card','bank_transfer','cheque') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_before from public.organizations where id = p_org_id;
  if v_before.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  v_valid_until := p_payment_date::timestamptz
    + case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end;

  update public.organizations
  set billing_tier_id = p_billing_tier_id,
      billing_status = 'active',
      trial_ends_at = v_valid_until
  where id = p_org_id
  returning * into v_after;

  -- Tax-inclusive amounts (ADR-0017); decompose for the invoice record.
  v_subtotal := round(p_amount_paise / 1.18);
  v_gst := p_amount_paise - v_subtotal;

  insert into public.billing_invoices (
    org_id, razorpay_payment_id, payment_method, billing_cycle,
    amount_subtotal_paise, gst_paise, total_paise, status, notes, recorded_by, client_uuid,
    billing_tier_id, tier_name_snapshot
  ) values (
    p_org_id, null, p_payment_method, p_billing_cycle,
    v_subtotal, v_gst, p_amount_paise, 'captured', p_notes, v_admin_id,
    coalesce(p_client_uuid, gen_random_uuid()),
    p_billing_tier_id, v_tier.name
  )
  returning id into v_invoice_id;

  insert into public.audit_log (org_id, store_id, user_id, entity, entity_id, action, before, after)
  values (
    p_org_id, null, null, 'organizations', p_org_id::text, 'update',
    to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object('_platform_admin_id', v_admin_id, '_manual_invoice_id', v_invoice_id)
  );

  return jsonb_build_object('org_id', p_org_id, 'invoice_id', v_invoice_id);
end;
$$;

comment on function public.rpc_console_record_manual_payment(uuid, uuid, text, integer, text, date, text, uuid) is
  'Platform-admin-only: activates/renews an org''s license from an offline payment (cash/UPI/card/bank_transfer/cheque) — no Razorpay involved. Sets billing_status=active and billing_tier_id, records a billing_invoices row (tier_name_snapshot for history), audited. Idempotent via p_client_uuid.';

revoke all on function public.rpc_console_record_manual_payment(uuid, uuid, text, integer, text, date, text, uuid) from public;
grant execute on function public.rpc_console_record_manual_payment(uuid, uuid, text, integer, text, date, text, uuid) to authenticated;

-- ============================================================================
-- 12) rpc_create_org_with_owner (self-serve signup, migration 0001) — assign
--     the catalog's default tier (if any) instead of hardcoding 'solo'.
-- ============================================================================

create or replace function public.rpc_create_org_with_owner(
  p_org_name text,
  p_full_name text,
  p_phone text default null
)
returns table (org_id uuid, profile_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email extensions.citext;
  v_org_id uuid;
  v_tier public.billing_tiers;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.user_profiles where id = v_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  select email::extensions.citext into v_user_email from auth.users where id = v_user_id;
  if v_user_email is null then
    raise exception 'auth_user_missing_email' using errcode = '23502';
  end if;

  -- Self-serve signups land on whichever tier is marked is_default (if any
  -- and active); ungoverned (null billing_tier_id, 14-day trial) otherwise —
  -- e.g. before a platform admin has created any tier yet.
  select * into v_tier from public.billing_tiers where is_default and is_active limit 1;

  insert into public.organizations (name, billing_tier_id, billing_status, trial_ends_at)
  values (p_org_name, v_tier.id, 'trial', now() + (coalesce(v_tier.trial_days, 14) || ' days')::interval)
  returning id into v_org_id;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (v_user_id, v_org_id, null, p_full_name, v_user_email, p_phone, 'super_admin');

  return query select v_org_id, v_user_id;
end;
$$;

comment on function public.rpc_create_org_with_owner(text, text, text) is
  'One-shot onboarding: creates an org and the calling user as its super_admin. Assigns the catalog''s default billing tier if one is configured (is_default and is_active), else leaves the org ungoverned. Idempotent against duplicate calls (returns conflict).';

-- ============================================================================
-- 13) rpc_console_list_orgs / rpc_console_get_org_detail — surface tier info.
-- ============================================================================

drop function if exists public.rpc_console_list_orgs();

create function public.rpc_console_list_orgs()
returns table (
  id                uuid,
  name              text,
  legal_name        text,
  plan_tier         text,
  billing_tier_id   uuid,
  billing_tier_name text,
  billing_status    text,
  trial_ends_at     timestamptz,
  store_count       bigint,
  staff_count       bigint,
  created_at        timestamptz
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
      o.id,
      o.name,
      o.legal_name,
      o.plan_tier,
      o.billing_tier_id,
      t.name,
      o.billing_status,
      o.trial_ends_at,
      (select count(*) from public.stores s where s.org_id = o.id),
      (select count(*) from public.user_profiles p where p.org_id = o.id),
      o.created_at
    from public.organizations o
    left join public.billing_tiers t on t.id = o.billing_tier_id
    order by o.created_at desc;
end;
$$;

comment on function public.rpc_console_list_orgs() is
  'Platform-admin-only: every organization on the platform, with store/staff counts and resolved tier name, for the Console Org Directory.';

revoke all on function public.rpc_console_list_orgs() from public;
grant execute on function public.rpc_console_list_orgs() to authenticated;

drop function if exists public.rpc_console_get_org_detail(uuid);

create function public.rpc_console_get_org_detail(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organizations;
  v_tier public.billing_tiers;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  if v_org.billing_tier_id is not null then
    select * into v_tier from public.billing_tiers where id = v_org.billing_tier_id;
  end if;

  select jsonb_build_object(
    'org', to_jsonb(v_org.*) || jsonb_build_object(
      'billing_tier', case when v_tier.id is not null then jsonb_build_object(
        'id', v_tier.id, 'name', v_tier.name, 'max_stores', v_tier.max_stores,
        'max_staff', v_tier.max_staff, 'features', v_tier.features
      ) else null end
    ),
    'stores', coalesce((
      select jsonb_agg(to_jsonb(s.*) order by s.created_at)
      from public.stores s
      where s.org_id = p_org_id
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg((to_jsonb(p.*) - 'pin_hash') order by p.role, p.full_name)
      from public.user_profiles p
      where p.org_id = p_org_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.rpc_console_get_org_detail(uuid) is
  'Platform-admin-only: one organization (with its resolved billing_tier object) plus its full store and staff lists, read-only, for the Console Org Directory detail page.';

revoke all on function public.rpc_console_get_org_detail(uuid) from public;
grant execute on function public.rpc_console_get_org_detail(uuid) to authenticated;
