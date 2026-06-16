-- §2.9 Suppliers parity
-- Creates supplier_ledgers table.
-- Extends rpc_list_suppliers with outstanding_balance, filter options.
-- Adds rpc_update_supplier, rpc_get_supplier_detail, rpc_get_supplier_ledger,
--      rpc_record_supplier_payment, rpc_get_supplier_medicines.

-- ─────────────────────────────────────────────────────────────────────────────
-- supplier_ledgers — mirrors customer_ledgers shape
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_ledgers (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  store_id         uuid references public.stores(id) on delete restrict,
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('purchase','payment','return','adjustment')),
  amount           numeric(12,2) not null,
  balance_after    numeric(12,2) not null,
  payment_method   text,
  notes            text,
  reference_type   text,
  reference_id     uuid,
  created_at       timestamptz not null default now()
);

create index if not exists sl_supplier_created_idx
  on public.supplier_ledgers (supplier_id, created_at desc);

alter table public.supplier_ledgers enable row level security;

create policy sl_select on public.supplier_ledgers
  for select using (org_id = public.current_org());

create policy sl_insert on public.supplier_ledgers
  for insert with check (org_id = public.current_org());

grant select, insert on public.supplier_ledgers to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_list_suppliers — add outstanding_balance, filter (p_filter: all/balance/settled)
-- Return type changes → DROP + CREATE
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_list_suppliers(uuid);

create function public.rpc_list_suppliers(
  p_store_id uuid    default null,
  p_filter   text    default 'all'   -- 'all' | 'balance' | 'settled'
)
returns table (
  id                  uuid,
  name                text,
  city                text,
  state               text,
  phone               text,
  gstin               text,
  outstanding_balance numeric,
  credit_limit        numeric,
  is_active           boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org_id uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org_id is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  return query
  select
    s.id, s.name,
    coalesce(s.city,''), coalesce(s.state,''),
    coalesce(s.phone,''), s.gstin,
    coalesce(s.outstanding_balance, 0),
    s.credit_limit,
    s.is_active
  from public.suppliers s
  where s.org_id = v_org_id
    and s.deleted_at is null
    and (s.store_id is null or p_store_id is null or s.store_id = p_store_id)
    and (
      p_filter = 'all'
      or (p_filter = 'balance' and coalesce(s.outstanding_balance, 0) > 0)
      or (p_filter = 'settled' and coalesce(s.outstanding_balance, 0) = 0)
    )
  order by s.name asc;
end;
$$;

revoke all on function public.rpc_list_suppliers(uuid, text) from public;
grant execute on function public.rpc_list_suppliers(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_update_supplier
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_update_supplier(
  p_supplier_id uuid,
  p_payload     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org  uuid := public.current_org();
  v_role text := public.user_role();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied: cannot update suppliers' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.org_id = v_org and s.deleted_at is null
  ) then
    raise exception 'not_found' using errcode = '42704';
  end if;

  update public.suppliers set
    name           = coalesce(nullif(trim(p_payload->>'name'),''), name),
    contact_person = nullif(trim(coalesce(p_payload->>'contact_person','')), ''),
    phone          = nullif(trim(coalesce(p_payload->>'phone','')), ''),
    email          = nullif(trim(coalesce(p_payload->>'email','')), ''),
    gstin          = nullif(upper(trim(coalesce(p_payload->>'gstin',''))), ''),
    city           = nullif(trim(coalesce(p_payload->>'city','')), ''),
    state          = nullif(trim(coalesce(p_payload->>'state','')), ''),
    pincode        = nullif(trim(coalesce(p_payload->>'pincode','')), ''),
    address        = nullif(trim(coalesce(p_payload->>'address','')), ''),
    credit_limit   = case when p_payload ? 'credit_limit' and p_payload->>'credit_limit' is not null then (p_payload->>'credit_limit')::numeric else credit_limit end,
    credit_days    = case when p_payload ? 'credit_days'  and p_payload->>'credit_days'  is not null then (p_payload->>'credit_days')::integer  else credit_days  end,
    updated_at     = now()
  where id = p_supplier_id;

  return (select row_to_json(s)::jsonb from public.suppliers s where s.id = p_supplier_id);
end;
$$;

revoke all on function public.rpc_update_supplier(uuid, jsonb) from public;
grant execute on function public.rpc_update_supplier(uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_supplier_detail — supplier + quick stats + recent purchases
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_supplier_detail(p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
  v_sup jsonb;
  v_stats jsonb;
  v_purchases jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  select row_to_json(s)::jsonb into v_sup
  from public.suppliers s
  where s.id = p_supplier_id and s.org_id = v_org and s.deleted_at is null;

  if v_sup is null then raise exception 'not_found' using errcode = '42704'; end if;

  -- quick stats from batches supplied (either directly or via purchases)
  select jsonb_build_object(
    'batch_count',        count(distinct b.id),
    'low_stock_count',    count(distinct b.id) filter (where b.current_quantity <= m.reorder_level and b.current_quantity >= 0),
    'expiry_soon_count',  count(distinct b.id) filter (where b.expiry_date <= current_date + interval '90 days' and b.expiry_date > current_date and b.current_quantity > 0)
  )
  into v_stats
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.deleted_at is null
    and (
      b.supplier_id = p_supplier_id
      or b.id in (
        select pi.batch_id from public.purchase_items pi
        join public.purchases pu on pu.id = pi.purchase_id
        where pu.supplier_id = p_supplier_id and pi.batch_id is not null
      )
    );

  -- recent purchases (last 20)
  select jsonb_agg(
    jsonb_build_object(
      'id',             p.id,
      'bill_number',    p.bill_number,
      'bill_date',      p.bill_date,
      'total_amount',   p.total_amount,
      'payment_status', p.payment_status,
      'items_count',    (select count(*) from public.purchase_items pi where pi.purchase_id = p.id)
    ) order by p.bill_date desc, p.id desc
  )
  into v_purchases
  from (
    select p2.id, p2.bill_number, p2.bill_date, p2.total_amount, p2.payment_status
    from public.purchases p2
    where p2.supplier_id = p_supplier_id
      and p2.deleted_at is null
    order by p2.bill_date desc, p2.id desc
    limit 20
  ) p;

  return jsonb_build_object(
    'supplier',         v_sup,
    'quick_stats',      coalesce(v_stats, '{}'::jsonb),
    'recent_purchases', coalesce(v_purchases, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_get_supplier_detail(uuid) from public;
grant execute on function public.rpc_get_supplier_detail(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_supplier_ledger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_supplier_ledger(
  p_supplier_id uuid,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns table (
  id               uuid,
  transaction_type text,
  amount           numeric,
  balance_after    numeric,
  payment_method   text,
  notes            text,
  reference_type   text,
  reference_id     uuid,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  return query
  select
    sl.id, sl.transaction_type, sl.amount, sl.balance_after,
    sl.payment_method, sl.notes, sl.reference_type, sl.reference_id,
    sl.created_at
  from public.supplier_ledgers sl
  where sl.supplier_id = p_supplier_id and sl.org_id = v_org
  order by sl.created_at desc, sl.id desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.rpc_get_supplier_ledger(uuid, integer, integer) from public;
grant execute on function public.rpc_get_supplier_ledger(uuid, integer, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_record_supplier_payment — balance update + ledger + FIFO allocation
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_record_supplier_payment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org         uuid := public.current_org();
  v_role        text := public.user_role();
  v_supplier_id uuid;
  v_store_id    uuid;
  v_amount      numeric;
  v_method      text;
  v_notes       text;
  v_old_balance numeric;
  v_new_balance numeric;

  -- FIFO cursor
  v_remaining   numeric;
  v_pur         record;
  v_alloc       numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin') then
    raise exception 'permission_denied: cannot record supplier payments' using errcode = '42501';
  end if;

  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_amount      := (p_payload->>'amount')::numeric;
  v_method      := nullif(trim(coalesce(p_payload->>'payment_method','')), '');
  v_notes       := nullif(trim(coalesce(p_payload->>'notes','')), '');

  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;

  select s.outstanding_balance, s.store_id
  into v_old_balance, v_store_id
  from public.suppliers s
  where s.id = v_supplier_id and s.org_id = v_org and s.deleted_at is null;

  if not found then raise exception 'not_found' using errcode = '42704'; end if;

  v_new_balance := greatest(0, v_old_balance - v_amount);

  -- Update supplier balance
  update public.suppliers set outstanding_balance = v_new_balance, updated_at = now()
  where id = v_supplier_id;

  -- Insert ledger row
  insert into public.supplier_ledgers (
    org_id, store_id, supplier_id, transaction_type,
    amount, balance_after, payment_method, notes,
    reference_type
  ) values (
    v_org, v_store_id, v_supplier_id, 'payment',
    v_amount, v_new_balance, v_method, v_notes,
    'payment'
  );

  -- FIFO allocation: walk oldest-first unpaid purchases
  v_remaining := v_amount;
  for v_pur in (
    select p.id, p.total_amount, coalesce(p.paid_amount, 0) as paid_amount
    from public.purchases p
    where p.supplier_id = v_supplier_id
      and p.deleted_at is null
      and p.payment_status in ('pending','partial')
    order by p.bill_date asc, p.id asc
  ) loop
    exit when v_remaining <= 0;
    v_alloc := least(v_remaining, v_pur.total_amount - v_pur.paid_amount);
    if v_alloc > 0 then
      update public.purchases set
        paid_amount    = coalesce(paid_amount, 0) + v_alloc,
        payment_status = case
          when coalesce(paid_amount, 0) + v_alloc >= total_amount then 'paid'
          else 'partial'
        end
      where id = v_pur.id;
      v_remaining := v_remaining - v_alloc;
    end if;
  end loop;

  return jsonb_build_object('new_balance', v_new_balance);
end;
$$;

revoke all on function public.rpc_record_supplier_payment(jsonb) from public;
grant execute on function public.rpc_record_supplier_payment(jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_supplier_medicines — batches ever supplied by this supplier
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_supplier_medicines(p_supplier_id uuid)
returns table (
  medicine_id      uuid,
  medicine_name    text,
  batch_id         uuid,
  batch_number     text,
  expiry_date      date,
  current_quantity integer,
  purchase_rate    numeric,
  mrp              numeric,
  gst_percentage   numeric,
  days_to_expiry   integer,
  min_stock_level  integer,
  reorder_level    integer,
  is_low_stock     boolean,
  purchase_item_id uuid,
  purchase_id      uuid,
  last_purchase_date date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  return query
  select
    m.id,
    m.name,
    b.id,
    b.batch_number,
    b.expiry_date,
    b.current_quantity,
    b.purchase_rate,
    b.mrp,
    b.gst_percentage,
    (b.expiry_date - current_date)::integer,
    m.min_stock_level,
    m.reorder_level,
    (b.current_quantity <= m.reorder_level),
    -- most recent purchase_item for this batch from this supplier
    (
      select pi.id from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.batch_id = b.id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    ),
    (
      select pu.id from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.batch_id = b.id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    ),
    (
      select pu.bill_date from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.batch_id = b.id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    )
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.deleted_at is null
    and b.org_id = v_org
    and (
      b.supplier_id = p_supplier_id
      or exists (
        select 1 from public.purchase_items pi
        join public.purchases pu on pu.id = pi.purchase_id
        where pi.batch_id = b.id
          and pu.supplier_id = p_supplier_id
          and pu.deleted_at is null
      )
    )
  order by (b.expiry_date - current_date) asc, m.name asc;
end;
$$;

revoke all on function public.rpc_get_supplier_medicines(uuid) from public;
grant execute on function public.rpc_get_supplier_medicines(uuid) to authenticated;
