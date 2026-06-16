-- ShelfCure Cloud — Migration 0037
-- §2.1 Dashboard: rpc_dashboard_stats (full KPI shape), rpc_dashboard_chart_data, rpc_upcoming_refills

-- ============================================================================
-- rpc_dashboard_stats — full dashboard KPI shape (replaces rpc_dashboard_summary)
-- Mirrors desktop's DashboardStats shape exactly so future columns won't
-- break clients that destructure the JSON.
-- ============================================================================

create or replace function public.rpc_dashboard_stats(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_today    date := current_date;
  v_month_start date := date_trunc('month', current_date);
  v_result   jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_org_id := public.current_org();

  select jsonb_build_object(
    -- ── today sales ──────────────────────────────────────────────────────────
    'today_sale_count',    coalesce(ts.cnt,  0),
    'today_sales',         coalesce(ts.tot,  0),
    'today_gst_collected', coalesce(ts.gst,  0),
    'today_purchases',     coalesce(tp.tot,  0),

    -- ── today returns ────────────────────────────────────────────────────────
    'today_returns',       coalesce(tr.tot,  0),

    -- ── today profit (naive: sales - returns - cogs) ─────────────────────────
    -- cogs = sum(qty * purchase_rate) from today's sale_items via batches
    'today_profit',        coalesce(ts.tot,0) - coalesce(tr.tot,0) - coalesce(tc.cogs,0),

    -- ── month-to-date ────────────────────────────────────────────────────────
    'month_sale_count',    coalesce(ms.cnt,  0),
    'monthly_sales',       coalesce(ms.tot,  0),
    'monthly_returns',     coalesce(mr.tot,  0),
    'monthly_profit',      coalesce(ms.tot,0) - coalesce(mr.tot,0) - coalesce(mc.cogs,0),

    -- ── inventory ────────────────────────────────────────────────────────────
    'total_medicines',     coalesce(inv.med_count, 0),
    'total_stock_value',   coalesce(inv.stock_val, 0),
    'low_stock_count',     coalesce(inv.low_cnt,   0),
    'expiry_soon_count',   coalesce(inv.exp_soon,  0),
    'expired_count',       coalesce(inv.expired,   0),

    -- ── credit ───────────────────────────────────────────────────────────────
    'outstanding_credit',  coalesce(cr.total, 0),

    -- ── misc ─────────────────────────────────────────────────────────────────
    'store_count',         coalesce(sc.cnt, 0)
  )
  into v_result

  from

  -- today sales
  lateral (
    select count(*)::int as cnt, coalesce(sum(total_amount),0) as tot,
           coalesce(sum(gst_amount),0) as gst
    from public.sales
    where store_id = p_store_id
      and bill_date = v_today
      and deleted_at is null
  ) ts,

  -- today purchases
  lateral (
    select coalesce(sum(total_amount),0) as tot
    from public.purchases
    where store_id = p_store_id
      and bill_date = v_today
      and deleted_at is null
  ) tp,

  -- today returns
  lateral (
    select coalesce(sum(sr.total_amount),0) as tot
    from public.sale_returns sr
    join public.sales s on s.id = sr.sale_id
    where s.store_id = p_store_id
      and sr.return_date = v_today
  ) tr,

  -- today COGS (sum of qty * purchase_rate on sold batches)
  lateral (
    select coalesce(sum(si.quantity * b.purchase_rate),0) as cogs
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    join public.batches b on b.id = si.batch_id
    where s.store_id = p_store_id
      and s.bill_date = v_today
      and s.deleted_at is null
      and si.batch_id is not null
  ) tc,

  -- month-to-date sales
  lateral (
    select count(*)::int as cnt, coalesce(sum(total_amount),0) as tot
    from public.sales
    where store_id = p_store_id
      and bill_date >= v_month_start
      and deleted_at is null
  ) ms,

  -- month-to-date returns
  lateral (
    select coalesce(sum(sr.total_amount),0) as tot
    from public.sale_returns sr
    join public.sales s on s.id = sr.sale_id
    where s.store_id = p_store_id
      and sr.return_date >= v_month_start
  ) mr,

  -- month-to-date COGS
  lateral (
    select coalesce(sum(si.quantity * b.purchase_rate),0) as cogs
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    join public.batches b on b.id = si.batch_id
    where s.store_id = p_store_id
      and s.bill_date >= v_month_start
      and s.deleted_at is null
      and si.batch_id is not null
  ) mc,

  -- inventory aggregates
  lateral (
    select
      count(distinct m.id)::int as med_count,
      coalesce(sum(b.current_quantity * b.purchase_rate),0) as stock_val,
      count(distinct case when b.current_quantity <= m.min_stock_level and b.current_quantity >= 0
                          and m.min_stock_level > 0 then m.id end)::int as low_cnt,
      count(distinct case when b.expiry_date between current_date and current_date + 90
                          and b.current_quantity > 0 then b.id end)::int as exp_soon,
      count(distinct case when b.expiry_date < current_date
                          and b.current_quantity > 0 then b.id end)::int as expired
    from public.medicines m
    join public.batches b on b.medicine_id = m.id
    where b.store_id = p_store_id
      and m.deleted_at is null
      and b.deleted_at is null
  ) inv,

  -- customer outstanding credit
  lateral (
    select coalesce(sum(c.outstanding_balance),0) as total
    from public.customers c
    where c.store_id = p_store_id
      and c.deleted_at is null
      and c.outstanding_balance > 0
  ) cr,

  -- store count (for org)
  lateral (
    select count(*)::int as cnt
    from public.stores s
    where s.org_id = v_org_id
      and s.is_active = true
  ) sc;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_dashboard_stats(uuid) from public;
grant execute on function public.rpc_dashboard_stats(uuid) to authenticated;

-- ============================================================================
-- rpc_dashboard_chart_data — daily series for the bi-weekly area chart
-- ============================================================================

create or replace function public.rpc_dashboard_chart_data(p_store_id uuid, p_days integer default 14)
returns table (
  day       text,
  sales     numeric,
  purchases numeric,
  returns   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- Generate p_days days ending today (zero-fill via generate_series)
  return query
    with date_series as (
      select (current_date - ((p_days - 1 - n) || ' days')::interval)::date as d
      from generate_series(0, p_days - 1) as t(n)
    ),
    daily_sales as (
      select bill_date as d, sum(total_amount) as total
      from public.sales
      where store_id = p_store_id
        and bill_date >= current_date - (p_days - 1)
        and deleted_at is null
      group by bill_date
    ),
    daily_purchases as (
      select bill_date as d, sum(total_amount) as total
      from public.purchases
      where store_id = p_store_id
        and bill_date >= current_date - (p_days - 1)
        and deleted_at is null
      group by bill_date
    ),
    daily_returns as (
      select sr.return_date as d, sum(sr.total_amount) as total
      from public.sale_returns sr
      join public.sales s on s.id = sr.sale_id
      where s.store_id = p_store_id
        and sr.return_date >= current_date - (p_days - 1)
      group by sr.return_date
    )
    select
      to_char(ds.d, 'YYYY-MM-DD') as day,
      coalesce(s.total, 0)  as sales,
      coalesce(p.total, 0)  as purchases,
      coalesce(r.total, 0)  as returns
    from date_series ds
    left join daily_sales     s on s.d = ds.d
    left join daily_purchases p on p.d = ds.d
    left join daily_returns   r on r.d = ds.d
    order by ds.d;
end;
$$;

revoke all on function public.rpc_dashboard_chart_data(uuid,integer) from public;
grant execute on function public.rpc_dashboard_chart_data(uuid,integer) to authenticated;

-- ============================================================================
-- rpc_upcoming_refills — customer refill reminders for the dashboard card
-- ============================================================================

create or replace function public.rpc_upcoming_refills(p_store_id uuid, p_days integer default 7)
returns table (
  customer_id         uuid,
  customer_name       text,
  customer_phone      text,
  medicine_id         uuid,
  medicine_name       text,
  sale_unit_mode      text,
  units_per_pack      integer,
  interval_days       integer,
  remind_days_before  integer,
  last_dispensed_date date,
  next_due_date       date,
  days_until_due      integer,
  total_stock         integer,
  min_stock_level     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
    select
      c.id    as customer_id,
      c.name  as customer_name,
      c.phone as customer_phone,
      m.id    as medicine_id,
      m.name  as medicine_name,
      m.sale_unit_mode,
      m.units_per_pack,
      crm.interval_days,
      crm.remind_days_before,
      crm.last_dispensed_date,
      crm.next_due_date,
      (crm.next_due_date - current_date)::integer as days_until_due,
      coalesce(stock.total_qty, 0)::integer as total_stock,
      coalesce(m.min_stock_level, 0)  as min_stock_level
    from public.customer_regular_medicines crm
    join public.customers c on c.id = crm.customer_id
    join public.medicines m on m.id = crm.medicine_id
    left join lateral (
      select sum(b.current_quantity)::integer as total_qty
      from public.batches b
      where b.medicine_id = m.id
        and b.store_id = p_store_id
        and b.current_quantity > 0
        and (b.expiry_date is null or b.expiry_date >= current_date)
        and b.deleted_at is null
    ) stock on true
    where c.store_id = p_store_id
      and c.deleted_at is null
      and c.is_active = true
      and crm.next_due_date is not null
      and crm.next_due_date <= current_date + p_days
    order by crm.next_due_date asc, c.name asc;
end;
$$;

revoke all on function public.rpc_upcoming_refills(uuid,integer) from public;
grant execute on function public.rpc_upcoming_refills(uuid,integer) to authenticated;
