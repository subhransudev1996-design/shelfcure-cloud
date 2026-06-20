-- ShelfCure Cloud — Migration 0062
-- ShelfCure Console, Phase 4 (ADR-0018, ADR-0017): real Razorpay billing
-- infrastructure. No access enforcement — billing_status becomes
-- webhook-driven and real, but apps/web/apps/admin access is unaffected.
--
-- Amounts are stored in paise (integer), matching Razorpay's own API units —
-- converted to rupees only for display.
--
-- razorpay_plan_id is nullable: 'enterprise' has no Razorpay plan (sales-led,
-- no self-serve checkout). The other 3 tiers start null too, filled in by a
-- one-off setup script (apps/console/scripts/setup-razorpay-plans.mjs) once
-- real Razorpay credentials are confirmed — mirrors how the first platform
-- admin was bootstrapped outside the app in Phase 1.

create table public.billing_plans (
  plan_tier        text primary key check (plan_tier in ('solo','team','chain','enterprise')),
  razorpay_plan_id text,
  amount_paise     integer check (amount_paise is null or amount_paise > 0),
  is_active        boolean not null default true
);

comment on table public.billing_plans is
  'One row per plan tier mapping to a Razorpay Plan. enterprise has no razorpay_plan_id (sales-led, no self-serve checkout). RPC-only access.';

insert into public.billing_plans (plan_tier, razorpay_plan_id, amount_paise) values
  ('solo', null, 99900),
  ('team', null, 299900),
  ('chain', null, 499900),
  ('enterprise', null, null);

alter table public.billing_plans enable row level security;
-- Intentionally no policies — read via rpc_console_list_billing_plans() only.

revoke all on public.billing_plans from public;
revoke all on public.billing_plans from authenticated;

create table public.billing_invoices (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete restrict,
  razorpay_payment_id      text not null unique,
  razorpay_subscription_id text,
  amount_subtotal_paise    integer not null check (amount_subtotal_paise >= 0),
  gst_paise                integer not null check (gst_paise >= 0),
  total_paise              integer not null check (total_paise >= 0),
  status                   text not null check (status in ('captured','failed','refunded')),
  created_at               timestamptz not null default now()
);

comment on table public.billing_invoices is
  'One row per captured/failed Razorpay payment event, written by the razorpay-webhook Edge Function (service role). GST is a flat 18%% subtotal split today — CGST/SGST-vs-IGST line breakdown deferred until ShelfCure''s registered state is finalized (see Console Phase 4 plan). RPC-only access.';

create index billing_invoices_org_idx on public.billing_invoices (org_id, created_at desc);

alter table public.billing_invoices enable row level security;
-- Intentionally no policies — read via rpc_console_list_org_invoices() only;
-- written directly by the webhook function's service-role client.

revoke all on public.billing_invoices from public;
revoke all on public.billing_invoices from authenticated;

-- ============================================================================
-- rpc_console_list_billing_plans — plan picker for "start subscription".
-- ============================================================================

create or replace function public.rpc_console_list_billing_plans()
returns table (
  plan_tier        text,
  razorpay_plan_id text,
  amount_paise     integer,
  is_active        boolean
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
    select bp.plan_tier, bp.razorpay_plan_id, bp.amount_paise, bp.is_active
    from public.billing_plans bp
    order by bp.amount_paise nulls last;
end;
$$;

revoke all on function public.rpc_console_list_billing_plans() from public;
grant execute on function public.rpc_console_list_billing_plans() to authenticated;

-- ============================================================================
-- rpc_console_list_org_invoices — invoice history for one org's detail page.
-- ============================================================================

create or replace function public.rpc_console_list_org_invoices(p_org_id uuid)
returns table (
  id                    uuid,
  razorpay_payment_id   text,
  amount_subtotal_paise integer,
  gst_paise             integer,
  total_paise           integer,
  status                text,
  created_at            timestamptz
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
    select bi.id, bi.razorpay_payment_id, bi.amount_subtotal_paise, bi.gst_paise,
           bi.total_paise, bi.status, bi.created_at
    from public.billing_invoices bi
    where bi.org_id = p_org_id
    order by bi.created_at desc;
end;
$$;

revoke all on function public.rpc_console_list_org_invoices(uuid) from public;
grant execute on function public.rpc_console_list_org_invoices(uuid) to authenticated;

-- ============================================================================
-- rpc_console_save_subscription — called by razorpay-create-subscription
-- after it creates the Customer + Subscription in Razorpay.
-- ============================================================================

create or replace function public.rpc_console_save_subscription(
  p_org_id                   uuid,
  p_razorpay_customer_id     text,
  p_razorpay_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  update public.organizations
  set razorpay_customer_id = p_razorpay_customer_id,
      razorpay_subscription_id = p_razorpay_subscription_id
  where id = p_org_id
  returning * into v_org;

  if v_org.id is null then
    raise exception 'not_found: organization' using errcode = 'P0002';
  end if;

  return to_jsonb(v_org);
end;
$$;

revoke all on function public.rpc_console_save_subscription(uuid, text, text) from public;
grant execute on function public.rpc_console_save_subscription(uuid, text, text) to authenticated;
