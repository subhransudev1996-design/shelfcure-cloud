-- ShelfCure Cloud — Migration 0001
-- Tenancy foundation: organizations, stores, user_profiles.
-- Helper functions for RLS. Onboarding RPC. updated_at triggers.
--
-- This migration is the bedrock. Every subsequent business table will reference
-- organizations and stores via org_id / store_id and use the helpers defined here
-- for row-level security.
--
-- Conventions:
--   - UUIDs for tenancy roots and user-facing identifiers.
--   - All timestamps timestamptz, default now().
--   - All tables have updated_at maintained by trigger.
--   - Soft-delete via deleted_at on operational tables (none yet in this migration).
--   - RLS is the source of truth for authorization. Client gating is UX only.

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists "pgcrypto"   with schema extensions;  -- gen_random_uuid()
create extension if not exists "citext"     with schema extensions;  -- case-insensitive text (emails)


-- ============================================================================
-- Shared utility: updated_at trigger
-- ============================================================================

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at() is
  'Generic trigger that sets updated_at = now() on every row update.';


-- ============================================================================
-- organizations — the tenant root
-- ============================================================================

create table public.organizations (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (length(trim(name)) between 2 and 120),
  legal_name                  text,
  gstin_default               text check (gstin_default is null or gstin_default ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  plan_tier                   text not null default 'solo' check (plan_tier in ('solo','team','chain','enterprise')),
  billing_status              text not null default 'trial' check (billing_status in ('trial','active','past_due','cancelled','expired')),
  trial_ends_at               timestamptz,
  shared_masters_enabled      boolean not null default false,         -- ADR-0002
  razorpay_customer_id        text,
  razorpay_subscription_id    text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.organizations is
  'Top-level tenant. One paying customer = one organization. Owns 1..N stores and 1..N users.';
comment on column public.organizations.shared_masters_enabled is
  'ADR-0002: when true, medicine/customer/supplier masters are shared across all stores in this org.';
comment on column public.organizations.gstin_default is
  'ADR-0005: default GSTIN inherited by stores that do not override.';

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.tg_set_updated_at();


-- ============================================================================
-- stores — physical pharmacy outlets
-- ============================================================================

create table public.stores (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  code                text not null check (code ~ '^[A-Z0-9-]{2,6}$'),       -- ADR-0012
  name                text not null check (length(trim(name)) between 2 and 120),
  gstin               text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  drug_license_no     text,
  address             text not null default '',
  city                text not null default '',
  state               text not null default '',
  pincode             text not null default '' check (pincode = '' or pincode ~ '^[0-9]{6}$'),
  phone               text not null default '' check (phone = '' or phone ~ '^[0-9+\-\s()]{6,20}$'),
  email               text not null default '',
  owner_name          text not null default '',
  gst_scheme          text not null default 'regular' check (gst_scheme in ('regular','composition','unregistered')),
  gst_filing_type     text not null default 'monthly' check (gst_filing_type in ('monthly','quarterly')),
  idle_lock_minutes   integer not null default 10 check (idle_lock_minutes between 0 and 120),  -- ADR-0011
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, code)
);

comment on table public.stores is
  'Physical pharmacy outlet. Always belongs to exactly one organization.';
comment on column public.stores.code is
  'ADR-0012: 2-6 char uppercase alphanumeric code, unique within org. Used in bill/purchase/transfer numbering.';
comment on column public.stores.idle_lock_minutes is
  'ADR-0011: per-store idle-lock duration. 0 disables.';

create index stores_org_id_idx on public.stores (org_id) where is_active;
create index stores_org_code_idx on public.stores (org_id, code);

create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.tg_set_updated_at();


-- ============================================================================
-- user_profiles — extends auth.users with role + scope
-- ============================================================================

create table public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid references public.stores(id) on delete restrict,         -- null for org-scoped roles
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  email           citext not null,
  phone           text,
  role            text not null check (role in ('super_admin','store_admin','pharmacist','cashier','accountant')),
  pin_hash        text,
  pin_set_at      timestamptz,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- super_admin and accountant are org-scoped (store_id must be null).
  -- Other roles are store-scoped (store_id must be set).
  constraint user_profiles_scope_matches_role check (
    (role in ('super_admin','accountant') and store_id is null) or
    (role in ('store_admin','pharmacist','cashier') and store_id is not null)
  )
);

comment on table public.user_profiles is
  'User identity + role + scope. One row per auth.users row. Cardinality 1:1 (multi-org deferred per ADR-0008).';

create index user_profiles_org_id_idx on public.user_profiles (org_id) where is_active;
create index user_profiles_store_id_idx on public.user_profiles (store_id) where store_id is not null and is_active;

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.tg_set_updated_at();


-- ============================================================================
-- RLS helper functions
--
-- These are called from RLS policies on every business table. They must be:
--   - SECURITY DEFINER so they can read user_profiles regardless of the caller's RLS view.
--   - STABLE so the planner can cache results within a single query.
--   - Search path explicitly set to avoid hijacking via search_path manipulation.
-- ============================================================================

create or replace function public.current_org()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from public.user_profiles where id = auth.uid()
$$;

comment on function public.current_org() is
  'Returns the organization_id of the currently authenticated user, or NULL if none.';

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

comment on function public.current_role() is
  'Returns the role of the currently authenticated user, or NULL if no profile exists.';

create or replace function public.current_store()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select store_id from public.user_profiles where id = auth.uid()
$$;

comment on function public.current_store() is
  'Returns the assigned store_id of the currently authenticated user (NULL for org-scoped roles).';

create or replace function public.user_has_store_access(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.current_role() in ('super_admin','accountant') then
      exists (
        select 1 from public.stores
        where id = target_store_id and org_id = public.current_org()
      )
    else
      target_store_id = public.current_store()
  end
$$;

comment on function public.user_has_store_access(uuid) is
  'True if the current user can access the given store: org-wide for super_admin/accountant, exact match otherwise.';


-- ============================================================================
-- Row-Level Security policies
-- ============================================================================

alter table public.organizations enable row level security;
alter table public.stores        enable row level security;
alter table public.user_profiles enable row level security;

-- organizations: a user can read their own org. Only super_admin can update org-level settings.
create policy organizations_select_own on public.organizations
  for select using (id = public.current_org());

create policy organizations_update_super_admin on public.organizations
  for update using (id = public.current_org() and public.current_role() = 'super_admin')
  with check  (id = public.current_org() and public.current_role() = 'super_admin');

-- No public insert/delete on organizations — creation is via rpc_create_org_with_owner only.

-- stores: read access via user_has_store_access. Super_admin can manage; others read-only on their store.
create policy stores_select on public.stores
  for select using (public.user_has_store_access(id));

create policy stores_insert_super_admin on public.stores
  for insert with check (org_id = public.current_org() and public.current_role() = 'super_admin');

create policy stores_update_super_admin on public.stores
  for update using (org_id = public.current_org() and public.current_role() = 'super_admin')
  with check       (org_id = public.current_org() and public.current_role() = 'super_admin');

create policy stores_delete_super_admin on public.stores
  for delete using (org_id = public.current_org() and public.current_role() = 'super_admin');

-- user_profiles:
--   * Every authenticated user can read their own profile.
--   * super_admin can read any profile in their org.
--   * store_admin can read profiles assigned to their store.
--   * super_admin can insert/update/delete (except super_admin demoting themselves — UI concern).
--   * store_admin can insert/update profiles for their own store (except super_admins).
create policy user_profiles_select_self on public.user_profiles
  for select using (id = auth.uid());

create policy user_profiles_select_org_admin on public.user_profiles
  for select using (
    org_id = public.current_org()
    and public.current_role() in ('super_admin','accountant')
  );

create policy user_profiles_select_store_admin on public.user_profiles
  for select using (
    public.current_role() = 'store_admin'
    and store_id = public.current_store()
  );

create policy user_profiles_insert_super_admin on public.user_profiles
  for insert with check (
    org_id = public.current_org() and public.current_role() = 'super_admin'
  );

create policy user_profiles_insert_store_admin on public.user_profiles
  for insert with check (
    public.current_role() = 'store_admin'
    and org_id = public.current_org()
    and store_id = public.current_store()
    and role in ('pharmacist','cashier')   -- store_admin cannot create elevated roles
  );

create policy user_profiles_update_self on public.user_profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());  -- cannot self-promote

create policy user_profiles_update_super_admin on public.user_profiles
  for update using (
    org_id = public.current_org() and public.current_role() = 'super_admin'
  );

create policy user_profiles_update_store_admin on public.user_profiles
  for update using (
    public.current_role() = 'store_admin'
    and store_id = public.current_store()
    and role in ('pharmacist','cashier')
  );

-- No delete policy: user_profiles are deactivated via is_active = false, never hard-deleted.


-- ============================================================================
-- Onboarding RPC
--
-- A newly-signed-up user (auth.users row exists, no user_profiles row yet) calls
-- this once to create their organization and their super_admin profile atomically.
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
  v_user_email citext;
  v_org_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.user_profiles where id = v_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  select email::citext into v_user_email from auth.users where id = v_user_id;
  if v_user_email is null then
    raise exception 'auth_user_missing_email' using errcode = '23502';
  end if;

  insert into public.organizations (name, plan_tier, billing_status, trial_ends_at)
  values (p_org_name, 'solo', 'trial', now() + interval '14 days')
  returning id into v_org_id;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (v_user_id, v_org_id, null, p_full_name, v_user_email, p_phone, 'super_admin');

  return query select v_org_id, v_user_id;
end;
$$;

comment on function public.rpc_create_org_with_owner(text, text, text) is
  'One-shot onboarding: creates an org and the calling user as its super_admin. Idempotent against duplicate calls (returns conflict).';

revoke all on function public.rpc_create_org_with_owner(text, text, text) from public;
grant execute on function public.rpc_create_org_with_owner(text, text, text) to authenticated;


-- ============================================================================
-- Grants for the standard Supabase roles
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- Authenticated users can interact with these tables, but RLS gates everything.
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update on public.user_profiles to authenticated;

-- Helper functions are read-only and safe to expose.
grant execute on function public.current_org() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_store() to authenticated;
grant execute on function public.user_has_store_access(uuid) to authenticated;
