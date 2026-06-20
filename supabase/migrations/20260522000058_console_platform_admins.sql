-- ShelfCure Cloud — Migration 0058
-- ShelfCure Console, Phase 1 (ADR-0018): a platform-level admin tier above the
-- org owner. ShelfCure's own staff don't belong to any organization, so they
-- can't be a user_profiles row (org_id NOT NULL is deliberate — ADR-0008).
-- This adds a wholly separate identity space, `platform_admins`, plus the
-- read-only Org Directory RPCs and the RPC that finalizes a new platform
-- admin's row after the create-platform-admin Edge Function creates their
-- auth.users row.
--
-- Like staff_salary_payments, RLS is enabled with NO policies at all — every
-- read and write goes through a SECURITY DEFINER RPC that checks
-- is_platform_admin() explicitly. There is no legitimate reason for a browser
-- to .from('platform_admins').select() directly.

-- ============================================================================
-- 1) platform_admins
-- ============================================================================

create table public.platform_admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  email       extensions.citext not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.platform_admins is
  'ShelfCure''s own staff (ADR-0018) — not customers, not a user_profiles row. Flat in v1: every active platform admin has equal, full access to apps/console.';

alter table public.platform_admins enable row level security;
-- Intentionally no policies — access is RPC-only (see rpc_console_* below).

revoke all on public.platform_admins from public;
revoke all on public.platform_admins from authenticated;

-- ============================================================================
-- 2) is_platform_admin() — the gate every Console RPC checks.
-- ============================================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
    where id = auth.uid() and is_active
  )
$$;

comment on function public.is_platform_admin() is
  'ADR-0018: true if the calling auth.uid() is an active platform admin (ShelfCure staff, not a customer). Mirrors how user_role()/current_org() gate apps/web and apps/admin.';

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- ============================================================================
-- 3) rpc_console_list_orgs — Org Directory list.
-- ============================================================================

create or replace function public.rpc_console_list_orgs()
returns table (
  id                uuid,
  name              text,
  legal_name        text,
  plan_tier         text,
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
      o.billing_status,
      o.trial_ends_at,
      (select count(*) from public.stores s where s.org_id = o.id),
      (select count(*) from public.user_profiles p where p.org_id = o.id),
      o.created_at
    from public.organizations o
    order by o.created_at desc;
end;
$$;

comment on function public.rpc_console_list_orgs() is
  'Platform-admin-only: every organization on the platform, with store/staff counts, for the Console Org Directory.';

revoke all on function public.rpc_console_list_orgs() from public;
grant execute on function public.rpc_console_list_orgs() to authenticated;

-- ============================================================================
-- 4) rpc_console_get_org_detail — Org Directory detail view.
-- ============================================================================

create or replace function public.rpc_console_get_org_detail(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organizations;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'org', to_jsonb(v_org.*),
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
  'Platform-admin-only: one organization plus its full store and staff lists, read-only, for the Console Org Directory detail page.';

revoke all on function public.rpc_console_get_org_detail(uuid) from public;
grant execute on function public.rpc_console_get_org_detail(uuid) to authenticated;

-- ============================================================================
-- 5) rpc_console_list_platform_admins — Platform Admins page.
-- ============================================================================

create or replace function public.rpc_console_list_platform_admins()
returns table (
  id          uuid,
  full_name   text,
  email       text,
  is_active   boolean,
  created_at  timestamptz
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
    select pa.id, pa.full_name, pa.email::text, pa.is_active, pa.created_at
    from public.platform_admins pa
    order by pa.created_at asc;
end;
$$;

comment on function public.rpc_console_list_platform_admins() is
  'Platform-admin-only: lists every platform admin, for the Console Platform Admins page.';

revoke all on function public.rpc_console_list_platform_admins() from public;
grant execute on function public.rpc_console_list_platform_admins() to authenticated;

-- ============================================================================
-- 6) rpc_console_finalize_platform_admin — called by create-platform-admin
--    Edge Function after admin.createUser succeeds. Same two-step pattern as
--    rpc_finalize_staff_profile: the auth row is created with the service
--    role, then this RPC (running as the calling platform admin) inserts the
--    platform_admins row with the permission check in Postgres.
-- ============================================================================

create or replace function public.rpc_console_finalize_platform_admin(
  p_user_id   uuid,
  p_email     text,
  p_full_name text
)
returns table (
  id         uuid,
  full_name  text,
  email      text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if exists (select 1 from public.platform_admins where id = p_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  insert into public.platform_admins (id, full_name, email)
  values (p_user_id, trim(p_full_name), p_email);

  return query
    select pa.id, pa.full_name, pa.email::text
    from public.platform_admins pa
    where pa.id = p_user_id;
end;
$$;

comment on function public.rpc_console_finalize_platform_admin(uuid, text, text) is
  'Called by the create-platform-admin Edge Function after admin.createUser succeeds. Platform-admin-only — there is no self-serve or first-row-is-free path into this tier by design (ADR-0018).';

revoke all on function public.rpc_console_finalize_platform_admin(uuid, text, text) from public;
grant execute on function public.rpc_console_finalize_platform_admin(uuid, text, text) to authenticated;
