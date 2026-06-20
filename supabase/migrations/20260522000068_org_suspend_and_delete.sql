-- ShelfCure Cloud — Migration 0068
-- ShelfCure Console: org-level "Suspend subscription" and "Delete organization"
-- (ADR-0018 extension).
--
-- Suspend is a real, orthogonal kill switch — `is_suspended` is independent of
-- `billing_status` (trial/active/past_due/cancelled/expired) so toggling it
-- off restores whatever billing state the org was already in, instead of
-- guessing what billing_status to revert to. Enforcement point is sign-in
-- only (rpc_check_org_access, called by apps/web and apps/admin right after
-- supabase.auth.signInWithPassword succeeds): an already-open session is not
-- forcibly torn down mid-use — per explicit product decision, this is a
-- gate at the door, not a continuous per-request check.
--
-- Delete is a true hard delete — irreversible, no soft-delete/deactivate
-- fallback, per explicit product decision. rpc_console_delete_organization
-- walks every business table that references organizations (directly via
-- org_id, or transitively through a header row) in dependency-safe order and
-- removes every row, then the organization itself. Item-level tables
-- (sale_items, purchase_items, etc.) are not deleted explicitly — they are
-- `on delete cascade` from their header row (sales, purchases, ...), so
-- deleting the header is sufficient. pos_hotkey_groups (and its items) is the
-- one table in this schema with `on delete cascade` straight from
-- organizations, so it cleans itself up when the final `delete from
-- organizations` runs. auth.users rows for the org's staff cannot be deleted
-- from inside Postgres (that needs the service role) — this RPC instead
-- returns their ids so the calling Edge Function (console-delete-org) can
-- remove them via the Admin API afterward.

-- ============================================================================
-- 1) organizations.is_suspended / suspended_at
-- ============================================================================

alter table public.organizations
  add column is_suspended boolean not null default false,
  add column suspended_at timestamptz;

comment on column public.organizations.is_suspended is
  'Platform-admin kill switch (ADR-0018): true blocks every member of this org from signing in to apps/web and apps/admin. Checked once, at sign-in, via rpc_check_org_access — does not affect apps/console (platform admins are not org members) and does not terminate an already-open session.';

-- ============================================================================
-- 2) rpc_console_set_org_suspended — toggle, from the Console org page.
-- ============================================================================

create function public.rpc_console_set_org_suspended(
  p_org_id    uuid,
  p_suspended boolean
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

  update public.organizations
  set is_suspended = p_suspended,
      suspended_at = case when p_suspended then now() else null end
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

comment on function public.rpc_console_set_org_suspended(uuid, boolean) is
  'Platform-admin-only: toggles is_suspended on an organization. Does not touch billing_status — unsuspending restores whatever billing state the org was already in. Audited via audit_log with the platform admin''s id embedded in `after`.';

revoke all on function public.rpc_console_set_org_suspended(uuid, boolean) from public;
grant execute on function public.rpc_console_set_org_suspended(uuid, boolean) to authenticated;

-- ============================================================================
-- 3) rpc_check_org_access — called by apps/web and apps/admin right after
--    sign-in succeeds; not platform-admin-gated (any authenticated user calls
--    this about themselves).
-- ============================================================================

create function public.rpc_check_org_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_suspended boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select o.is_suspended into v_suspended
  from public.user_profiles up
  join public.organizations o on o.id = up.org_id
  where up.id = v_uid;

  -- No user_profiles row (e.g. a platform admin who somehow signs into
  -- apps/web, or a profile mid-onboarding) — nothing to block here.
  if v_suspended is true then
    return jsonb_build_object('allowed', false, 'reason', 'suspended');
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

comment on function public.rpc_check_org_access() is
  'Called by apps/web and apps/admin immediately after supabase.auth.signInWithPassword succeeds. Returns {allowed:false, reason:"suspended"} if the signed-in user''s org is suspended, in which case the caller signs the session back out before navigating anywhere — the actual sign-in enforcement point (ADR-0018).';

revoke all on function public.rpc_check_org_access() from public;
grant execute on function public.rpc_check_org_access() to authenticated;

-- ============================================================================
-- 4) rpc_console_delete_organization — true hard delete, irreversible.
-- ============================================================================

create function public.rpc_console_delete_organization(
  p_org_id      uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       public.organizations;
  v_user_ids  uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  if trim(p_confirm_name) <> v_org.name then
    raise exception 'name_mismatch: confirmation text does not match the organization name' using errcode = '22023';
  end if;

  select array_agg(id) into v_user_ids from public.user_profiles where org_id = p_org_id;

  -- Sales side: returns must go before sales (sale_returns.sale_id is
  -- restrict). sale_items/sale_return_items cascade from their headers.
  delete from public.sale_returns where org_id = p_org_id;
  delete from public.sale_payments where org_id = p_org_id;
  delete from public.sale_items where org_id = p_org_id;
  delete from public.sales where org_id = p_org_id;

  -- Purchases side: returns before purchases (purchase_returns.purchase_id is
  -- restrict). challans/purchase_orders only set-null reference purchases, so
  -- they can go in any order relative to it.
  delete from public.purchase_return_items where org_id = p_org_id;
  delete from public.purchase_returns where org_id = p_org_id;
  delete from public.challan_items where org_id = p_org_id;
  delete from public.challans where org_id = p_org_id;
  delete from public.purchase_order_items where org_id = p_org_id;
  delete from public.purchase_orders where org_id = p_org_id;
  delete from public.purchase_items where org_id = p_org_id;
  delete from public.purchases where org_id = p_org_id;

  -- Inter-store transfers (items cascade from the transfer header).
  delete from public.stock_transfer_items where org_id = p_org_id;
  delete from public.stock_transfers where org_id = p_org_id;

  -- Rows that restrict back to batches/medicines/expenses/user_profiles —
  -- must be cleared before those tables.
  delete from public.stock_corrections where org_id = p_org_id;
  delete from public.doctor_commission_payouts where org_id = p_org_id;
  delete from public.staff_salary_payments where org_id = p_org_id;
  delete from public.expenses where org_id = p_org_id;

  -- Stock + masters (batches before medicines; sales/purchases/suppliers'
  -- restricts on these are already cleared above).
  delete from public.batches where org_id = p_org_id;
  delete from public.customer_regular_medicines where org_id = p_org_id;
  delete from public.medicines where org_id = p_org_id;
  delete from public.medicine_categories where org_id = p_org_id;
  delete from public.doctors where org_id = p_org_id;
  delete from public.customers where org_id = p_org_id;
  delete from public.suppliers where org_id = p_org_id;

  -- Notifications, billing, audit trail, org-specific expense categories
  -- (system-wide rows with org_id null are untouched).
  delete from public.notifications where org_id = p_org_id;
  delete from public.billing_invoices where org_id = p_org_id;
  delete from public.audit_log where org_id = p_org_id;
  delete from public.expense_categories where org_id = p_org_id;

  -- Staff last among the data tables: every created_by/updated_by/
  -- performed_by/paid_by/etc. row that referenced user_profiles is gone now.
  delete from public.user_profiles where org_id = p_org_id;

  -- Stores, then the organization itself. pos_hotkey_groups (and its items)
  -- cascade automatically here — the one on-delete-cascade exception in this
  -- schema, straight from organizations.
  delete from public.stores where org_id = p_org_id;
  delete from public.organizations where id = p_org_id;

  -- No audit_log entry for this action: the org's own audit trail was just
  -- deleted above, and a fresh row can't be inserted afterward (organizations
  -- no longer exists for it to reference). Intentional — hard delete means
  -- irreversible and untraceable, per explicit product decision.
  return jsonb_build_object(
    'org_id', p_org_id,
    'deleted_user_ids', coalesce(to_jsonb(v_user_ids), '[]'::jsonb)
  );
end;
$$;

comment on function public.rpc_console_delete_organization(uuid, text) is
  'Platform-admin-only: permanently deletes an organization and every row scoped to it, across every business table, in FK-safe order. Irreversible — requires the caller to pass the organization''s exact current name as p_confirm_name. Returns the auth.users ids of every deleted staff member so the calling Edge Function (console-delete-org) can remove their auth rows too via the Admin API — this RPC alone cannot, since that needs the service role.';

revoke all on function public.rpc_console_delete_organization(uuid, text) from public;
grant execute on function public.rpc_console_delete_organization(uuid, text) to authenticated;

-- ============================================================================
-- 5) rpc_console_list_orgs — surface is_suspended for the Org Directory.
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
  is_suspended      boolean,
  suspended_at      timestamptz,
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
      o.is_suspended,
      o.suspended_at,
      (select count(*) from public.stores s where s.org_id = o.id),
      (select count(*) from public.user_profiles p where p.org_id = o.id),
      o.created_at
    from public.organizations o
    left join public.billing_tiers t on t.id = o.billing_tier_id
    order by o.created_at desc;
end;
$$;

comment on function public.rpc_console_list_orgs() is
  'Platform-admin-only: every organization on the platform, with store/staff counts, resolved tier name, and suspension status, for the Console Org Directory.';

revoke all on function public.rpc_console_list_orgs() from public;
grant execute on function public.rpc_console_list_orgs() to authenticated;
