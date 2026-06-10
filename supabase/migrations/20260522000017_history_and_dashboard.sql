-- ShelfCure Cloud — Migration 0017
-- History list/detail RPCs + dashboard summary + customer create.
-- Same SECURITY DEFINER + #variable_conflict use_column pattern as 0013-0016.

-- ============================================================================
-- rpc_create_customer — mirror of rpc_create_supplier/medicine
-- ============================================================================

create or replace function public.rpc_create_customer(p_payload jsonb)
returns table (
  id            uuid,
  name          text,
  phone         text,
  email         text,
  customer_type text,
  is_active     boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_role     text;
  v_store_id uuid;
  v_new_id   uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();
  v_role   := public.user_role();
  if v_org_id is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist','cashier') then
    raise exception 'permission_denied: cannot create customers' using errcode = '42501';
  end if;

  v_store_id := nullif(p_payload->>'store_id','')::uuid;
  if v_store_id is not null then
    if not exists (select 1 from public.stores s where s.id = v_store_id and s.org_id = v_org_id) then
      raise exception 'invalid_store_id' using errcode = '23503';
    end if;
  end if;

  insert into public.customers (
    org_id, store_id, name, phone, email, address,
    customer_type, gstin, state, credit_limit, credit_days
  )
  values (
    v_org_id, v_store_id,
    trim(p_payload->>'name'),
    coalesce(trim(p_payload->>'phone'), ''),
    nullif(trim(coalesce(p_payload->>'email','')),''),
    nullif(trim(coalesce(p_payload->>'address','')),''),
    coalesce(nullif(p_payload->>'customer_type',''),'b2c'),
    nullif(trim(coalesce(p_payload->>'gstin','')),''),
    nullif(trim(coalesce(p_payload->>'state','')),''),
    nullif(p_payload->>'credit_limit','')::numeric,
    nullif(p_payload->>'credit_days','')::integer
  )
  returning customers.id into v_new_id;

  return query
    select c.id, c.name, c.phone, c.email, c.customer_type, c.is_active
    from public.customers c where c.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_customer(jsonb) from public;
grant execute on function public.rpc_create_customer(jsonb) to authenticated;


-- ============================================================================
-- rpc_list_sales — recent sales for a store with paging
-- ============================================================================

create or replace function public.rpc_list_sales(
  p_store_id uuid,
  p_from     date    default null,
  p_to       date    default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  id            uuid,
  bill_number   text,
  bill_date     date,
  customer_id   uuid,
  customer_name text,
  total_amount  numeric,
  payment_method text,
  payment_status text,
  is_returned   boolean,
  created_at    timestamptz,
  created_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.bill_number,
    s.bill_date,
    s.customer_id,
    coalesce(c.name, 'Walk-in'),
    s.total_amount,
    s.payment_method,
    s.payment_status,
    s.is_returned,
    s.created_at,
    coalesce(up.full_name, '')
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  left join public.user_profiles up on up.id = s.created_by
  where s.store_id = p_store_id
    and s.deleted_at is null
    and (p_from is null or s.bill_date >= p_from)
    and (p_to   is null or s.bill_date <= p_to)
  order by s.bill_date desc, s.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_sales(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_list_sales(uuid, date, date, integer, integer) to authenticated;


-- ============================================================================
-- rpc_get_sale_detail — header + items + payments for a single sale
-- Returned as a single JSON object so the client gets atomic read.
-- ============================================================================

create or replace function public.rpc_get_sale_detail(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'sale', to_jsonb(s.*)
      || jsonb_build_object(
        'customer_name', coalesce(c.name, 'Walk-in'),
        'customer_phone', c.phone,
        'store_name', st.name,
        'store_code', st.code,
        'created_by_name', up.full_name
      ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', si.id,
        'medicine_id', si.medicine_id,
        'medicine_name', coalesce(m.name, si.misc_note, 'Item'),
        'batch_id', si.batch_id,
        'batch_number', b.batch_number,
        'expiry_date', b.expiry_date,
        'quantity', si.quantity,
        'mrp', si.mrp,
        'gst_percentage', si.gst_percentage,
        'taxable_amount', si.taxable_amount,
        'cgst_amount', si.cgst_amount,
        'sgst_amount', si.sgst_amount,
        'igst_amount', si.igst_amount,
        'amount', si.amount,
        'is_misc_item', si.is_misc_item
      ) order by si.id), '[]'::jsonb)
      from public.sale_items si
      left join public.medicines m on m.id = si.medicine_id
      left join public.batches b on b.id = si.batch_id
      where si.sale_id = s.id
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(sp.*) order by sp.created_at), '[]'::jsonb)
      from public.sale_payments sp where sp.sale_id = s.id
    )
  ) into v_sale
  from public.sales s
  join public.stores st on st.id = s.store_id
  left join public.customers c on c.id = s.customer_id
  left join public.user_profiles up on up.id = s.created_by
  where s.id = p_sale_id
    and public.user_has_store_access(s.store_id);

  if v_sale is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_sale;
end;
$$;

revoke all on function public.rpc_get_sale_detail(uuid) from public;
grant execute on function public.rpc_get_sale_detail(uuid) to authenticated;


-- ============================================================================
-- rpc_list_purchases — recent purchases for a store
-- ============================================================================

create or replace function public.rpc_list_purchases(
  p_store_id uuid,
  p_from     date    default null,
  p_to       date    default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  id             uuid,
  bill_number    text,
  bill_date      date,
  supplier_id    uuid,
  supplier_name  text,
  total_amount   numeric,
  payment_status text,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.bill_number, p.bill_date,
    p.supplier_id, sup.name,
    p.total_amount, p.payment_status,
    p.created_at
  from public.purchases p
  left join public.suppliers sup on sup.id = p.supplier_id
  where p.store_id = p_store_id
    and p.deleted_at is null
    and (p_from is null or p.bill_date >= p_from)
    and (p_to   is null or p.bill_date <= p_to)
  order by p.bill_date desc, p.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_purchases(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_list_purchases(uuid, date, date, integer, integer) to authenticated;


-- ============================================================================
-- rpc_get_purchase_detail
-- ============================================================================

create or replace function public.rpc_get_purchase_detail(p_purchase_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'purchase', to_jsonb(p.*)
      || jsonb_build_object(
        'supplier_name', sup.name,
        'supplier_gstin', sup.gstin,
        'store_name', st.name,
        'store_code', st.code
      ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'medicine_id', pi.medicine_id,
        'medicine_name', m.name,
        'batch_id', pi.batch_id,
        'batch_number', b.batch_number,
        'expiry_date', b.expiry_date,
        'quantity', pi.quantity,
        'purchase_rate', pi.purchase_rate,
        'mrp', pi.mrp,
        'gst_percentage', pi.gst_percentage,
        'amount', pi.amount
      ) order by pi.id), '[]'::jsonb)
      from public.purchase_items pi
      left join public.medicines m on m.id = pi.medicine_id
      left join public.batches b on b.id = pi.batch_id
      where pi.purchase_id = p.id
    )
  ) into v_p
  from public.purchases p
  join public.stores st on st.id = p.store_id
  left join public.suppliers sup on sup.id = p.supplier_id
  where p.id = p_purchase_id
    and public.user_has_store_access(p.store_id);

  if v_p is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_p;
end;
$$;

revoke all on function public.rpc_get_purchase_detail(uuid) from public;
grant execute on function public.rpc_get_purchase_detail(uuid) to authenticated;


-- ============================================================================
-- rpc_dashboard_summary — KPI numbers for the overview page.
-- All counters scoped to a single store passed in. If null, aggregates over
-- the caller's accessible stores (super_admin / accountant).
-- ============================================================================

create or replace function public.rpc_dashboard_summary(p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.current_org();
  v_role  text := public.user_role();
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_stores uuid[];
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  if p_store_id is not null then
    if not public.user_has_store_access(p_store_id) then
      raise exception 'permission_denied: store access' using errcode = '42501';
    end if;
    v_stores := array[p_store_id];
  else
    -- All stores in the org for super_admin/accountant; assigned store otherwise.
    if v_role in ('super_admin','accountant') then
      select array_agg(s.id) into v_stores
      from public.stores s
      where s.org_id = v_org and s.is_active;
    else
      v_stores := array[public.current_store()];
    end if;
  end if;

  if v_stores is null or array_length(v_stores, 1) is null then
    v_stores := array[]::uuid[];
  end if;

  with
    today as (
      select
        count(*)             as cnt,
        coalesce(sum(total_amount), 0)::numeric  as total,
        coalesce(sum(gst_amount), 0)::numeric    as gst
      from public.sales
      where store_id = any(v_stores)
        and bill_date = v_today
        and deleted_at is null
    ),
    month as (
      select
        count(*)             as cnt,
        coalesce(sum(total_amount), 0)::numeric as total
      from public.sales
      where store_id = any(v_stores)
        and bill_date >= v_month_start
        and deleted_at is null
    ),
    low_stock as (
      select count(*)::integer as cnt
      from public.medicines m
      where m.org_id = v_org
        and m.deleted_at is null
        and m.min_stock_level > coalesce((
          select sum(b.current_quantity)::integer
          from public.batches b
          where b.medicine_id = m.id
            and b.store_id = any(v_stores)
            and b.deleted_at is null
            and b.current_quantity > 0
        ), 0)
    ),
    expiring as (
      select count(*)::integer as cnt
      from public.batches b
      where b.store_id = any(v_stores)
        and b.deleted_at is null
        and b.current_quantity > 0
        and b.expiry_date <= (v_today + interval '90 days')
    )
  select jsonb_build_object(
    'today_sale_count', t.cnt,
    'today_sale_total', t.total,
    'today_gst_collected', t.gst,
    'month_sale_count', m.cnt,
    'month_sale_total', m.total,
    'low_stock_count', ls.cnt,
    'expiring_soon_count', e.cnt,
    'store_count', coalesce(array_length(v_stores, 1), 0)
  ) into v_result
  from today t, month m, low_stock ls, expiring e;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_dashboard_summary(uuid) from public;
grant execute on function public.rpc_dashboard_summary(uuid) to authenticated;


-- ============================================================================
-- rpc_low_stock_alerts — medicines below min_stock_level with on-hand
-- ============================================================================

create or replace function public.rpc_low_stock_alerts(p_store_id uuid, p_limit integer default 10)
returns table (
  medicine_id uuid,
  name        text,
  manufacturer text,
  on_hand     integer,
  min_level   integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  with stock as (
    select b.medicine_id, sum(b.current_quantity)::integer as on_hand
    from public.batches b
    where b.store_id = p_store_id and b.deleted_at is null and b.current_quantity > 0
    group by b.medicine_id
  )
  select
    m.id, m.name, m.manufacturer,
    coalesce(s.on_hand, 0)::integer,
    m.min_stock_level
  from public.medicines m
  left join stock s on s.medicine_id = m.id
  where m.org_id = public.current_org()
    and m.deleted_at is null
    and m.min_stock_level > coalesce(s.on_hand, 0)
  order by (m.min_stock_level - coalesce(s.on_hand, 0)) desc, m.name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_low_stock_alerts(uuid, integer) from public;
grant execute on function public.rpc_low_stock_alerts(uuid, integer) to authenticated;


-- ============================================================================
-- rpc_expiring_batches — batches expiring within N days
-- ============================================================================

create or replace function public.rpc_expiring_batches(
  p_store_id uuid,
  p_days     integer default 90,
  p_limit    integer default 10
)
returns table (
  batch_id      uuid,
  medicine_id   uuid,
  medicine_name text,
  batch_number  text,
  expiry_date   date,
  on_hand       integer,
  days_left     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_d   integer := greatest(1, least(coalesce(p_days, 90), 730));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    b.id, b.medicine_id, m.name,
    b.batch_number, b.expiry_date,
    b.current_quantity::integer,
    (b.expiry_date - current_date)::integer
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.store_id = p_store_id
    and b.deleted_at is null
    and b.current_quantity > 0
    and b.expiry_date <= (current_date + (v_d || ' days')::interval)
  order by b.expiry_date asc, m.name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_expiring_batches(uuid, integer, integer) from public;
grant execute on function public.rpc_expiring_batches(uuid, integer, integer) to authenticated;
