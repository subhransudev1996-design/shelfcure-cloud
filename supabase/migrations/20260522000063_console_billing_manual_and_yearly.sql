-- ShelfCure Cloud — Migration 0063
-- ShelfCure Console, Phase 4 extension: yearly billing cycle + manual/cash
-- license activation. Many customers of this Indian pharmacy SaaS pay via
-- field sales (cash/UPI/cheque), not online checkout — platform admins need
-- to grant trials and activate paid licenses without Razorpay being involved
-- at all, alongside the existing automated path.
--
-- trial_ends_at is deliberately NOT duplicated into a second "license valid
-- until" column — it's reused for both meanings (the Console UI relabels it
-- contextually based on billing_status). Razorpay-subscribed orgs don't need
-- it; Razorpay's own dashboard is authoritative for next-charge dates.

-- ============================================================================
-- 1) billing_plans — add the billing_cycle dimension.
-- ============================================================================

alter table public.billing_plans
  add column billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly'));

alter table public.billing_plans drop constraint billing_plans_pkey;
alter table public.billing_plans add primary key (plan_tier, billing_cycle);

insert into public.billing_plans (plan_tier, billing_cycle, razorpay_plan_id, amount_paise) values
  ('solo', 'yearly', null, 999900),
  ('team', 'yearly', null, 2999900),
  ('chain', 'yearly', null, 4999900);

comment on table public.billing_plans is
  'One row per (plan_tier, billing_cycle) mapping to a Razorpay Plan. enterprise has no razorpay_plan_id (sales-led, no self-serve checkout). RPC-only access.';

-- ============================================================================
-- 2) billing_invoices — support manual (non-Razorpay) payment records.
-- ============================================================================

alter table public.billing_invoices alter column razorpay_payment_id drop not null;

alter table public.billing_invoices
  add column payment_method text not null default 'razorpay'
    check (payment_method in ('razorpay','cash','upi','card','bank_transfer','cheque')),
  add column billing_cycle text check (billing_cycle is null or billing_cycle in ('monthly','yearly')),
  add column notes text,
  add column recorded_by uuid references public.platform_admins(id) on delete set null,
  add column client_uuid uuid not null default gen_random_uuid() unique;

comment on table public.billing_invoices is
  'One row per payment event — either webhook-driven (Razorpay, recorded_by null) or manually recorded by a platform admin (cash/upi/card/bank_transfer/cheque, recorded_by set). GST is a flat 18%% subtotal split today — CGST/SGST-vs-IGST line breakdown deferred until ShelfCure''s registered state is finalized. RPC-only access.';

-- ============================================================================
-- 3) rpc_console_list_billing_plans — return-shape change needs DROP+CREATE.
-- ============================================================================

drop function if exists public.rpc_console_list_billing_plans();

create function public.rpc_console_list_billing_plans()
returns table (
  plan_tier        text,
  billing_cycle     text,
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
    select bp.plan_tier, bp.billing_cycle, bp.razorpay_plan_id, bp.amount_paise, bp.is_active
    from public.billing_plans bp
    order by bp.plan_tier, bp.billing_cycle, bp.amount_paise nulls last;
end;
$$;

revoke all on function public.rpc_console_list_billing_plans() from public;
grant execute on function public.rpc_console_list_billing_plans() to authenticated;

-- ============================================================================
-- 4) rpc_console_list_org_invoices — return-shape change needs DROP+CREATE.
-- ============================================================================

drop function if exists public.rpc_console_list_org_invoices(uuid);

create function public.rpc_console_list_org_invoices(p_org_id uuid)
returns table (
  id                    uuid,
  razorpay_payment_id   text,
  payment_method        text,
  billing_cycle         text,
  amount_subtotal_paise integer,
  gst_paise             integer,
  total_paise           integer,
  status                text,
  notes                 text,
  recorded_by_name      text,
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
    select bi.id, bi.razorpay_payment_id, bi.payment_method, bi.billing_cycle,
           bi.amount_subtotal_paise, bi.gst_paise, bi.total_paise, bi.status,
           bi.notes, pa.full_name, bi.created_at
    from public.billing_invoices bi
    left join public.platform_admins pa on pa.id = bi.recorded_by
    where bi.org_id = p_org_id
    order by bi.created_at desc;
end;
$$;

revoke all on function public.rpc_console_list_org_invoices(uuid) from public;
grant execute on function public.rpc_console_list_org_invoices(uuid) to authenticated;

-- ============================================================================
-- 5) rpc_console_create_org — add p_trial_days (additive, non-breaking).
-- ============================================================================

create or replace function public.rpc_console_create_org(
  p_owner_user_id   uuid,
  p_org_name        text,
  p_owner_full_name text,
  p_owner_email     text,
  p_owner_phone     text default null,
  p_plan_tier       text default 'solo',
  p_trial_days      integer default 14
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

  if p_trial_days is null or p_trial_days < 0 then
    raise exception 'invalid_trial_days: %', p_trial_days using errcode = '22023';
  end if;

  if exists (select 1 from public.user_profiles where id = p_owner_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  insert into public.organizations (name, plan_tier, billing_status, trial_ends_at)
  values (p_org_name, p_plan_tier, 'trial', now() + (p_trial_days || ' days')::interval)
  returning id into v_org_id;

  insert into public.user_profiles (id, org_id, store_id, full_name, email, phone, role)
  values (p_owner_user_id, v_org_id, null, p_owner_full_name, p_owner_email, p_owner_phone, 'super_admin')
  returning id into v_profile_id;

  return jsonb_build_object('org_id', v_org_id, 'profile_id', v_profile_id);
end;
$$;

comment on function public.rpc_console_create_org(uuid, text, text, text, text, text, integer) is
  'Platform-admin-only: hand-creates an organization + its super_admin owner, for sales-assisted onboarding. p_trial_days controls the initial trial length (default 14, matching self-serve).';

revoke all on function public.rpc_console_create_org(uuid, text, text, text, text, text, integer) from public;
grant execute on function public.rpc_console_create_org(uuid, text, text, text, text, text, integer) to authenticated;

-- ============================================================================
-- 6) rpc_console_record_manual_payment — cash/UPI/card/bank/cheque activation.
-- ============================================================================

create or replace function public.rpc_console_record_manual_payment(
  p_org_id         uuid,
  p_plan_tier      text,
  p_billing_cycle  text,
  p_amount_paise   integer,
  p_payment_method text,
  p_payment_date   date    default current_date,
  p_notes          text    default null,
  p_client_uuid    uuid    default null
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

  if p_plan_tier not in ('solo','team','chain','enterprise') then
    raise exception 'invalid_plan_tier: %', p_plan_tier using errcode = '22023';
  end if;
  if p_billing_cycle not in ('monthly','yearly') then
    raise exception 'invalid_billing_cycle: %', p_billing_cycle using errcode = '22023';
  end if;
  if p_payment_method not in ('cash','upi','card','bank_transfer','cheque') then
    raise exception 'invalid_payment_method: %', p_payment_method using errcode = '22023';
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
  set plan_tier = p_plan_tier,
      billing_status = 'active',
      trial_ends_at = v_valid_until
  where id = p_org_id
  returning * into v_after;

  -- Plan amounts are tax-inclusive (ADR-0017: exclusive pricing + 18% GST
  -- collected together); decompose for the invoice record. CGST/SGST-vs-IGST
  -- split deferred — see Console Phase 4 plan's "known gaps."
  v_subtotal := round(p_amount_paise / 1.18);
  v_gst := p_amount_paise - v_subtotal;

  insert into public.billing_invoices (
    org_id, razorpay_payment_id, payment_method, billing_cycle,
    amount_subtotal_paise, gst_paise, total_paise, status, notes, recorded_by, client_uuid
  ) values (
    p_org_id, null, p_payment_method, p_billing_cycle,
    v_subtotal, v_gst, p_amount_paise, 'captured', p_notes, v_admin_id,
    coalesce(p_client_uuid, gen_random_uuid())
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

comment on function public.rpc_console_record_manual_payment(uuid, text, text, integer, text, date, text, uuid) is
  'Platform-admin-only: activates/renews an org''s license from an offline payment (cash/UPI/card/bank_transfer/cheque) — no Razorpay involved. Sets billing_status=active and plan_tier, records a billing_invoices row, audited. Idempotent via p_client_uuid.';

revoke all on function public.rpc_console_record_manual_payment(uuid, text, text, integer, text, date, text, uuid) from public;
grant execute on function public.rpc_console_record_manual_payment(uuid, text, text, integer, text, date, text, uuid) to authenticated;
