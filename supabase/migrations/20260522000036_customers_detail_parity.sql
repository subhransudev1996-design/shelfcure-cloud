-- ShelfCure Cloud — Migration 0036
-- §2.7 Customers: ledger table + full detail RPCs (update, ledger, payment FIFO, routine, sales/returns lists)

-- ============================================================================
-- customer_ledgers — append-only financial audit trail (mirrors supplier_ledgers)
-- ============================================================================

create table public.customer_ledgers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('sale','payment','return','adjustment')),
  reference_type  text,    -- 'sale' | 'sale_return' | null
  reference_id    uuid,
  amount          numeric(14,2) not null,   -- absolute; positive = increases balance
  balance_after   numeric(14,2) not null,
  payment_method  text,
  notes           text,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now()
);

comment on table public.customer_ledgers is
  'Append-only audit trail of every customer outstanding-balance change (sales, payments, returns).';

create index customer_ledgers_customer_idx on public.customer_ledgers (customer_id, created_at desc);
create index customer_ledgers_store_idx on public.customer_ledgers (store_id, created_at desc);

alter table public.customer_ledgers enable row level security;

create policy customer_ledgers_select on public.customer_ledgers
  for select using (public.user_has_store_access(store_id));

create policy customer_ledgers_insert on public.customer_ledgers
  for insert with check (public.user_has_store_access(store_id));

grant select, insert on public.customer_ledgers to authenticated;

-- ============================================================================
-- rpc_update_customer — edit profile + special discount
-- ============================================================================

create or replace function public.rpc_update_customer(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_org_id     uuid;
  v_role       text;
  v_id         uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();
  v_role   := public.user_role();
  if v_role not in ('super_admin','store_admin','pharmacist','cashier') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v_id := (p_payload->>'id')::uuid;

  update public.customers set
    name                  = coalesce(nullif(trim(p_payload->>'name'),''),   name),
    phone                 = coalesce(nullif(trim(p_payload->>'phone'),''),  phone),
    email                 = nullif(trim(coalesce(p_payload->>'email','')),  ''),
    address               = nullif(trim(coalesce(p_payload->>'address','')), ''),
    state                 = nullif(trim(coalesce(p_payload->>'state','')),  ''),
    customer_type         = coalesce(nullif(p_payload->>'customer_type',''), customer_type),
    gstin                 = nullif(trim(coalesce(p_payload->>'gstin','')),  ''),
    credit_limit          = case when p_payload ? 'credit_limit'
                                 then nullif(p_payload->>'credit_limit','')::numeric
                                 else credit_limit end,
    credit_days           = case when p_payload ? 'credit_days'
                                 then nullif(p_payload->>'credit_days','')::integer
                                 else credit_days end,
    special_discount_type = case when p_payload ? 'special_discount_type'
                                 then nullif(p_payload->>'special_discount_type','')
                                 else special_discount_type end,
    special_discount_value = case when p_payload ? 'special_discount_value'
                                  then coalesce(nullif(p_payload->>'special_discount_value','')::numeric, 0)
                                  else special_discount_value end,
    special_discount_label = case when p_payload ? 'special_discount_label'
                                  then nullif(trim(coalesce(p_payload->>'special_discount_label','')), '')
                                  else special_discount_label end,
    updated_by            = v_user_id
  where id = v_id
    and org_id = v_org_id
    and deleted_at is null;
end;
$$;

revoke all on function public.rpc_update_customer(jsonb) from public;
grant execute on function public.rpc_update_customer(jsonb) to authenticated;

-- ============================================================================
-- rpc_get_customer_detail — customer row + aggregate stats
-- ============================================================================

create or replace function public.rpc_get_customer_detail(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_result    jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  select jsonb_build_object(
    'customer', to_jsonb(c.*),
    'stats', jsonb_build_object(
      'sales_count',     coalesce(s.cnt, 0),
      'returns_count',   coalesce(r.cnt, 0),
      'lifetime_value',  coalesce(s.total, 0),
      'avg_bill_value',  case when coalesce(s.cnt, 0) > 0
                              then round(coalesce(s.total,0) / s.cnt, 2)
                              else 0 end
    )
  )
  into v_result
  from public.customers c
  left join lateral (
    select count(*) as cnt, sum(total_amount) as total
    from public.sales
    where customer_id = p_customer_id
      and deleted_at is null
  ) s on true
  left join lateral (
    select count(*) as cnt
    from public.sale_returns
    where sale_id in (
      select id from public.sales where customer_id = p_customer_id and deleted_at is null
    )
  ) r on true
  where c.id = p_customer_id
    and c.org_id = v_org_id
    and c.deleted_at is null;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_get_customer_detail(uuid) from public;
grant execute on function public.rpc_get_customer_detail(uuid) to authenticated;

-- ============================================================================
-- rpc_get_customer_ledger — paginated ledger entries
-- ============================================================================

create or replace function public.rpc_get_customer_ledger(
  p_customer_id uuid,
  p_limit       int  default 50,
  p_offset      int  default 0
)
returns table (
  id               uuid,
  transaction_type text,
  reference_type   text,
  reference_id     uuid,
  amount           numeric,
  balance_after    numeric,
  payment_method   text,
  notes            text,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  return query
    select
      cl.id, cl.transaction_type, cl.reference_type, cl.reference_id,
      cl.amount, cl.balance_after, cl.payment_method, cl.notes, cl.created_at
    from public.customer_ledgers cl
    join public.customers c on c.id = cl.customer_id
    where cl.customer_id = p_customer_id
      and c.org_id = v_org_id
    order by cl.created_at desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.rpc_get_customer_ledger(uuid,int,int) from public;
grant execute on function public.rpc_get_customer_ledger(uuid,int,int) to authenticated;

-- ============================================================================
-- rpc_record_customer_payment — record payment + FIFO allocation across sales
-- ============================================================================

create or replace function public.rpc_record_customer_payment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_org_id        uuid;
  v_store_id      uuid;
  v_customer_id   uuid;
  v_amount        numeric(14,2);
  v_method        text;
  v_notes         text;
  v_old_balance   numeric(14,2);
  v_new_balance   numeric(14,2);
  v_remaining     numeric(14,2);
  v_sale          record;
  v_sale_owed     numeric(14,2);
  v_allocated     numeric(14,2);
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id  := public.current_org();

  v_customer_id := (p_payload->>'customer_id')::uuid;
  v_amount      := (p_payload->>'amount')::numeric;
  v_method      := coalesce(nullif(p_payload->>'payment_method',''), 'cash');
  v_notes       := nullif(trim(coalesce(p_payload->>'notes','')), '');

  if v_amount <= 0 then
    raise exception 'payment_amount_must_be_positive' using errcode = '22003';
  end if;

  -- lock customer row and get current balance + store_id
  select c.outstanding_balance, c.store_id
  into v_old_balance, v_store_id
  from public.customers c
  where c.id = v_customer_id
    and c.org_id = v_org_id
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'customer_not_found' using errcode = '23000';
  end if;

  -- new balance floors at 0
  v_new_balance := greatest(0, v_old_balance - v_amount);

  -- update customer balance
  update public.customers
  set outstanding_balance = v_new_balance, updated_by = v_user_id
  where id = v_customer_id;

  -- insert ledger entry
  insert into public.customer_ledgers (
    org_id, store_id, customer_id, transaction_type,
    amount, balance_after, payment_method, notes, created_by
  ) values (
    v_org_id, v_store_id, v_customer_id, 'payment',
    v_amount, v_new_balance, v_method, v_notes, v_user_id
  );

  -- FIFO allocation: pay off oldest unpaid/partial sales first
  v_remaining := v_amount;
  for v_sale in
    select s.id, s.total_amount, s.paid_amount
    from public.sales s
    where s.customer_id = v_customer_id
      and s.deleted_at is null
      and s.payment_status in ('pending','partial','credit')
    order by s.bill_date asc, s.id asc
  loop
    exit when v_remaining <= 0;
    v_sale_owed := v_sale.total_amount - v_sale.paid_amount;
    if v_sale_owed <= 0 then continue; end if;

    v_allocated := least(v_remaining, v_sale_owed);
    v_remaining := v_remaining - v_allocated;

    update public.sales
    set paid_amount     = paid_amount + v_allocated,
        payment_status  = case
                            when (paid_amount + v_allocated) >= total_amount then 'paid'
                            else 'partial'
                          end
    where id = v_sale.id;
  end loop;

  return jsonb_build_object('new_balance', v_new_balance);
end;
$$;

revoke all on function public.rpc_record_customer_payment(jsonb) from public;
grant execute on function public.rpc_record_customer_payment(jsonb) to authenticated;

-- ============================================================================
-- rpc_get_customer_routine — refill schedule with due-date info
-- ============================================================================

create or replace function public.rpc_get_customer_routine(p_customer_id uuid)
returns table (
  id                  uuid,
  medicine_id         uuid,
  medicine_name       text,
  sale_unit_mode      text,
  units_per_pack      integer,
  interval_days       integer,
  remind_days_before  integer,
  last_dispensed_date date,
  next_due_date       date,
  days_until_due      integer,
  notes               text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  return query
    select
      crm.id,
      crm.medicine_id,
      m.name as medicine_name,
      m.sale_unit_mode,
      m.units_per_pack,
      crm.interval_days,
      crm.remind_days_before,
      crm.last_dispensed_date,
      crm.next_due_date,
      (crm.next_due_date - current_date)::integer as days_until_due,
      crm.notes
    from public.customer_regular_medicines crm
    join public.medicines m on m.id = crm.medicine_id
    join public.customers c on c.id = crm.customer_id
    where crm.customer_id = p_customer_id
      and c.org_id = v_org_id
    order by crm.next_due_date asc nulls last;
end;
$$;

revoke all on function public.rpc_get_customer_routine(uuid) from public;
grant execute on function public.rpc_get_customer_routine(uuid) to authenticated;

-- ============================================================================
-- rpc_upsert_customer_routine — add or update a refill entry
-- ============================================================================

create or replace function public.rpc_upsert_customer_routine(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_org_id       uuid;
  v_customer_id  uuid;
  v_medicine_id  uuid;
  v_interval     integer;
  v_remind       integer;
  v_last_date    date;
  v_next_date    date;
  v_id           uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  v_customer_id := (p_payload->>'customer_id')::uuid;
  v_medicine_id := (p_payload->>'medicine_id')::uuid;
  v_interval    := nullif(p_payload->>'interval_days','')::integer;
  v_remind      := coalesce(nullif(p_payload->>'remind_days_before','')::integer, 3);
  v_last_date   := nullif(p_payload->>'last_dispensed_date','')::date;

  -- compute next_due_date
  if v_last_date is not null and v_interval is not null then
    v_next_date := v_last_date + v_interval;
  else
    v_next_date := null;
  end if;

  insert into public.customer_regular_medicines (
    org_id, customer_id, medicine_id,
    interval_days, remind_days_before,
    last_dispensed_date, next_due_date,
    notes
  ) values (
    v_org_id, v_customer_id, v_medicine_id,
    v_interval, v_remind,
    v_last_date, v_next_date,
    nullif(trim(coalesce(p_payload->>'notes','')), '')
  )
  on conflict (customer_id, medicine_id) do update set
    interval_days       = excluded.interval_days,
    remind_days_before  = excluded.remind_days_before,
    last_dispensed_date = excluded.last_dispensed_date,
    next_due_date       = excluded.next_due_date,
    notes               = excluded.notes
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_upsert_customer_routine(jsonb) from public;
grant execute on function public.rpc_upsert_customer_routine(jsonb) to authenticated;

-- ============================================================================
-- rpc_delete_customer_routine — remove a refill entry
-- ============================================================================

create or replace function public.rpc_delete_customer_routine(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  delete from public.customer_regular_medicines crm
  using public.customers c
  where crm.id = p_id
    and crm.customer_id = c.id
    and c.org_id = v_org_id;
end;
$$;

revoke all on function public.rpc_delete_customer_routine(uuid) from public;
grant execute on function public.rpc_delete_customer_routine(uuid) to authenticated;

-- ============================================================================
-- rpc_list_customer_sales — sales list for the customer detail page
-- ============================================================================

create or replace function public.rpc_list_customer_sales(
  p_customer_id uuid,
  p_limit       int  default 50,
  p_offset      int  default 0
)
returns table (
  id             uuid,
  bill_number    text,
  bill_date      text,
  total_amount   numeric,
  paid_amount    numeric,
  payment_status text,
  items_count    bigint,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  return query
    select
      s.id,
      s.bill_number,
      to_char(s.bill_date, 'YYYY-MM-DD') as bill_date,
      s.total_amount,
      s.paid_amount,
      s.payment_status,
      (select count(*) from public.sale_items si where si.sale_id = s.id) as items_count,
      s.created_at
    from public.sales s
    join public.customers c on c.id = s.customer_id
    where s.customer_id = p_customer_id
      and c.org_id = v_org_id
      and s.deleted_at is null
    order by s.bill_date desc, s.created_at desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.rpc_list_customer_sales(uuid,int,int) from public;
grant execute on function public.rpc_list_customer_sales(uuid,int,int) to authenticated;

-- ============================================================================
-- rpc_list_customer_returns — returns list for the customer detail page
-- ============================================================================

create or replace function public.rpc_list_customer_returns(
  p_customer_id uuid,
  p_limit       int  default 50,
  p_offset      int  default 0
)
returns table (
  id             uuid,
  return_number  text,
  return_date    text,
  bill_number    text,
  sale_id        uuid,
  total_amount   numeric,
  refund_method  text,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  return query
    select
      sr.id,
      sr.return_number,
      to_char(sr.return_date, 'YYYY-MM-DD') as return_date,
      s.bill_number,
      sr.sale_id,
      sr.total_amount,
      sr.refund_method,
      sr.created_at
    from public.sale_returns sr
    join public.sales s on s.id = sr.sale_id
    join public.customers c on c.id = s.customer_id
    where s.customer_id = p_customer_id
      and c.org_id = v_org_id
    order by sr.return_date desc, sr.created_at desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.rpc_list_customer_returns(uuid,int,int) from public;
grant execute on function public.rpc_list_customer_returns(uuid,int,int) to authenticated;
