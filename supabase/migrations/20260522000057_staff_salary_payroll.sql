-- ShelfCure Cloud — Migration 0057
-- Phase 3 of the admin panel: Salary / Payroll.
--
-- Adds a flat `monthly_salary` rate on user_profiles (mirrors how doctors store
-- commission_type/commission_rate directly on the doctors table — one current
-- value, no rate-history table) plus a `staff_salary_payments` ledger that
-- dual-writes into the existing `expenses` table under the seeded "Salaries"
-- category, so Finance reports stay accurate with no double-entry.
--
-- The "Salaries" expense_categories row is NOT a single stable UUID: migration
-- 0007 seeded one with a random id (org_id null, under the original
-- unique(org_id, name) constraint), and migration 0043 later seeded a SECOND
-- row with a hardcoded id (also org_id null, store_id null) — Postgres treats
-- NULL as distinct in unique constraints, so both rows can coexist without a
-- conflict. We never hardcode either id; the payment RPC resolves the category
-- by name at call time instead.

-- ============================================================================
-- 1) monthly_salary column
-- ============================================================================

alter table public.user_profiles
  add column if not exists monthly_salary numeric(12,2);

-- ============================================================================
-- 2) rpc_update_staff — extend the jsonb allow-list with monthly_salary.
--    Same signature as migration 0056 (additive, not breaking).
-- ============================================================================

create or replace function public.rpc_update_staff(
  p_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text := public.user_role();
  v_org_id      uuid := public.current_org();
  v_target      public.user_profiles;
  v_new_role    text;
  v_new_store   uuid;
  v_new_salary  numeric;
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_caller_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can edit staff' using errcode = '42501';
  end if;

  if p_user_id = v_caller_id then
    raise exception 'cannot_edit_self' using errcode = '42501';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_user_id and org_id = v_org_id;

  if v_target.id is null then
    raise exception 'not_found: staff member' using errcode = 'P0002';
  end if;

  if v_target.role = 'super_admin' then
    raise exception 'cannot_edit_super_admin' using errcode = '42501';
  end if;

  if p_payload ? 'role' then
    if p_payload->>'role' = 'super_admin' then
      raise exception 'invalid_role: super_admin' using errcode = '22023';
    end if;
    if p_payload->>'role' not in ('store_admin','pharmacist','cashier','accountant') then
      raise exception 'invalid_role: %', p_payload->>'role' using errcode = '22023';
    end if;
  end if;

  v_new_role  := coalesce(p_payload->>'role', v_target.role);
  v_new_store := case
                   when p_payload ? 'store_id' then nullif(p_payload->>'store_id','')::uuid
                   else v_target.store_id
                 end;

  if v_new_role in ('store_admin','pharmacist','cashier') then
    if v_new_store is null then
      raise exception 'store_required_for_role: %', v_new_role using errcode = '23502';
    end if;
    if not exists (select 1 from public.stores where id = v_new_store and org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  elsif v_new_role = 'accountant' then
    v_new_store := null;
  end if;

  if p_payload ? 'monthly_salary' then
    v_new_salary := nullif(p_payload->>'monthly_salary','')::numeric;
    if v_new_salary is not null and v_new_salary < 0 then
      raise exception 'invalid_monthly_salary' using errcode = '22023';
    end if;
  else
    v_new_salary := v_target.monthly_salary;
  end if;

  update public.user_profiles
  set
    full_name      = coalesce(nullif(trim(p_payload->>'full_name'),''), full_name),
    phone          = case when p_payload ? 'phone'
                       then nullif(trim(p_payload->>'phone'),'')
                       else phone end,
    role           = v_new_role,
    store_id       = v_new_store,
    is_active      = case when p_payload ? 'is_active'
                       then (p_payload->>'is_active')::boolean
                       else is_active end,
    monthly_salary = v_new_salary
  where id = p_user_id and org_id = v_org_id;

  return (to_jsonb(p.*) - 'pin_hash')
  from public.user_profiles p
  where p.id = p_user_id;
end;
$$;

comment on function public.rpc_update_staff(uuid, jsonb) is
  'super_admin-only partial update of a staff user_profiles row (full_name, phone, role, store_id, is_active, monthly_salary). Refuses self-edits and refuses to touch other super_admin rows. Never allows promotion to super_admin.';

revoke all on function public.rpc_update_staff(uuid, jsonb) from public;
grant execute on function public.rpc_update_staff(uuid, jsonb) to authenticated;

-- ============================================================================
-- 3) rpc_list_staff — return-shape change (add monthly_salary) needs DROP+CREATE.
-- ============================================================================

drop function if exists public.rpc_list_staff();

create function public.rpc_list_staff()
returns table (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  role            text,
  store_id        uuid,
  store_code      text,
  store_name      text,
  is_active       boolean,
  monthly_salary  numeric,
  last_login_at   timestamptz,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_role    text;
  v_store   uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_role  := public.user_role();
  v_org_id := public.current_org();
  v_store := public.current_store();

  if v_role is null or v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  if v_role = 'super_admin' or v_role = 'accountant' then
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.monthly_salary,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.org_id = v_org_id
      order by p.role, p.full_name;
  elsif v_role = 'store_admin' then
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.monthly_salary,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.org_id = v_org_id
        and p.store_id = v_store
      order by p.role, p.full_name;
  else
    return query
      select
        p.id,
        p.full_name,
        p.email::text,
        p.phone,
        p.role,
        p.store_id,
        s.code,
        s.name,
        p.is_active,
        p.monthly_salary,
        p.last_login_at,
        p.created_at
      from public.user_profiles p
      left join public.stores s on s.id = p.store_id
      where p.id = v_user_id;
  end if;
end;
$$;

revoke all on function public.rpc_list_staff() from public;
grant execute on function public.rpc_list_staff() to authenticated;

-- ============================================================================
-- 4) staff_salary_payments — payment-event ledger, dual-written with expenses.
--    RLS shape copies audit_log: read-only via policy, write-only via the RPC
--    below (SECURITY DEFINER bypasses RLS), so a payment can never exist
--    without its paired expense row.
-- ============================================================================

create table public.staff_salary_payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  user_profile_id uuid not null references public.user_profiles(id) on delete restrict,
  expense_id      uuid not null references public.expenses(id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  payment_date    date not null,
  payment_method  text check (payment_method is null or payment_method in ('cash','upi','card','bank_transfer','cheque')),
  notes           text,
  paid_by         uuid references public.user_profiles(id) on delete set null,
  client_uuid     uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (client_uuid)
);

comment on table public.staff_salary_payments is
  'One row per salary payment event, always paired 1:1 with an expenses row (category "Salaries") so Finance reports never double-count or miss payroll spend.';

create index staff_salary_payments_user_date_idx
  on public.staff_salary_payments (user_profile_id, payment_date desc);

alter table public.staff_salary_payments enable row level security;

create policy staff_salary_payments_select on public.staff_salary_payments
  for select using (
    org_id = public.current_org()
    and public.user_role() in ('super_admin','accountant')
  );

revoke all on public.staff_salary_payments from public;
grant select on public.staff_salary_payments to authenticated;

-- ============================================================================
-- 5) rpc_record_salary_payment — the dual-write RPC.
-- ============================================================================

create or replace function public.rpc_record_salary_payment(
  p_user_id        uuid,
  p_amount         numeric,
  p_payment_date   date,
  p_store_id       uuid    default null,
  p_payment_method text    default 'bank_transfer',
  p_notes          text    default null,
  p_client_uuid    uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_caller_role  text := public.user_role();
  v_org_id       uuid := public.current_org();
  v_target       public.user_profiles;
  v_store_id     uuid;
  v_category_id  uuid;
  v_expense_id   uuid;
  v_payment_id   uuid;
  v_existing     public.staff_salary_payments;
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;

  -- Idempotency: a retried submit with the same client_uuid returns the
  -- existing result instead of inserting a second time.
  if p_client_uuid is not null then
    select * into v_existing
    from public.staff_salary_payments
    where client_uuid = p_client_uuid;

    if v_existing.id is not null then
      return jsonb_build_object('id', v_existing.id, 'expense_id', v_existing.expense_id);
    end if;
  end if;

  if v_caller_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can record salary payments' using errcode = '42501';
  end if;

  if p_user_id = v_caller_id then
    raise exception 'cannot_pay_self' using errcode = '42501';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_user_id and org_id = v_org_id;

  if v_target.id is null then
    raise exception 'not_found: staff member' using errcode = 'P0002';
  end if;

  if v_target.role = 'super_admin' then
    raise exception 'cannot_pay_super_admin' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Resolve which store's books absorb the expense. Store-scoped staff always
  -- use their own store (ignore any client-supplied p_store_id — removes a
  -- foot-gun); org-wide staff (accountant) require an explicit, org-validated
  -- store_id since expenses.store_id is NOT NULL.
  if v_target.store_id is not null then
    v_store_id := v_target.store_id;
  else
    if p_store_id is null then
      raise exception 'store_required_for_org_wide_staff' using errcode = '23502';
    end if;
    if not exists (select 1 from public.stores where id = p_store_id and org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
    v_store_id := p_store_id;
  end if;

  -- Resolve the Salaries category dynamically — see header comment for why
  -- neither seeded id is hardcoded here.
  select id into v_category_id
  from public.expense_categories
  where org_id is null and store_id is null and name = 'Salaries'
  order by is_system desc, created_at asc
  limit 1;

  if v_category_id is null then
    raise exception 'salaries_category_missing' using errcode = '42704';
  end if;

  insert into public.expenses (
    org_id, store_id, category_id, description, amount, expense_date,
    payment_method, notes, created_by
  ) values (
    v_org_id,
    v_store_id,
    v_category_id,
    'Salary — ' || v_target.full_name || ' (' || to_char(p_payment_date, 'Mon YYYY') || ')',
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    v_caller_id
  )
  returning id into v_expense_id;

  insert into public.staff_salary_payments (
    org_id, store_id, user_profile_id, expense_id, amount, payment_date,
    payment_method, notes, paid_by, client_uuid
  ) values (
    v_org_id,
    v_store_id,
    p_user_id,
    v_expense_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    v_caller_id,
    coalesce(p_client_uuid, gen_random_uuid())
  )
  returning id into v_payment_id;

  return jsonb_build_object('id', v_payment_id, 'expense_id', v_expense_id);
end;
$$;

comment on function public.rpc_record_salary_payment(uuid, numeric, date, uuid, text, text, uuid) is
  'super_admin-only: records a salary payment AND its paired expenses row (category Salaries) in one call, so Finance reports stay accurate with no double-entry. Idempotent via p_client_uuid.';

revoke all on function public.rpc_record_salary_payment(uuid, numeric, date, uuid, text, text, uuid) from public;
grant execute on function public.rpc_record_salary_payment(uuid, numeric, date, uuid, text, text, uuid) to authenticated;

-- ============================================================================
-- 6) rpc_list_salary_payments — recent payments org-wide, for the History table.
-- ============================================================================

create or replace function public.rpc_list_salary_payments(
  p_limit integer default 200
)
returns table (
  id              uuid,
  user_profile_id uuid,
  staff_name      text,
  role            text,
  store_code      text,
  amount          numeric,
  payment_date    date,
  payment_method  text,
  notes           text,
  paid_by_name    text,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id      uuid := public.current_org();
  v_caller_role text := public.user_role();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_org_id is null then
    raise exception 'profile_missing' using errcode = '42501';
  end if;
  if v_caller_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can view salary payments' using errcode = '42501';
  end if;

  return query
    select
      sp.id,
      sp.user_profile_id,
      up.full_name,
      up.role,
      s.code,
      sp.amount,
      sp.payment_date,
      sp.payment_method,
      sp.notes,
      coalesce(pb.full_name, 'Unknown'),
      sp.created_at
    from public.staff_salary_payments sp
    left join public.user_profiles up on up.id = sp.user_profile_id
    left join public.stores s on s.id = sp.store_id
    left join public.user_profiles pb on pb.id = sp.paid_by
    where sp.org_id = v_org_id
      and sp.deleted_at is null
    order by sp.payment_date desc, sp.created_at desc
    limit p_limit;
end;
$$;

revoke all on function public.rpc_list_salary_payments(integer) from public;
grant execute on function public.rpc_list_salary_payments(integer) to authenticated;
