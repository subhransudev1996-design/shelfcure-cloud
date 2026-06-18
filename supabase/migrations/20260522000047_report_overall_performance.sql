-- ShelfCure Cloud — Migration 0047
-- §2.11.1 Overall Performance report + a bugfix found while building it.
--
-- 1. rpc_report_daily: top_meds CTE referenced si.total_amount, but
--    sale_items has no such column (it's `amount`). Never caught because
--    plpgsql function bodies aren't validated against the catalog at CREATE
--    time — only when actually executed. Fixed here.
-- 2. New rpc_report_overall_performance(p_store_id, p_period_type): a single
--    "health snapshot" blending period-over-period P&L KPIs with point-in-time
--    inventory and credit health.

-- ============================================================================
-- Fix: rpc_report_daily — si.total_amount -> si.amount
-- ============================================================================

create or replace function rpc_report_daily(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  with
    sales_agg as (
      select
        count(*)            as bill_count,
        sum(total_amount)   as gross_sales,
        sum(paid_amount)    as total_paid,
        sum(gst_amount)     as total_gst,
        sum(cgst_amount)    as cgst,
        sum(sgst_amount)    as sgst,
        sum(igst_amount)    as igst,
        count(distinct customer_id) filter (where customer_id is not null) as customer_count,
        sum(total_amount - paid_amount) as credit_extended
      from sales
      where store_id = p_store_id and bill_date between p_from and p_to and deleted_at is null
    ),
    returns_agg as (
      select
        count(*)          as returns_count,
        sum(total_amount) as returns_total
      from sale_returns
      where store_id = p_store_id and return_date between p_from and p_to
    ),
    purchases_agg as (
      select count(*) as purchases_count, sum(total_amount) as purchases_total
      from purchases
      where store_id = p_store_id and bill_date between p_from and p_to
    ),
    expenses_agg as (
      select coalesce(sum(amount), 0) as expenses_total
      from expenses
      where store_id = p_store_id and expense_date between p_from and p_to and deleted_at is null
    ),
    payments_agg as (
      select
        coalesce(sum(amount) filter (where transaction_type = 'payment'), 0) as customer_payments
      from customer_ledgers
      where store_id = p_store_id and created_at::date between p_from and p_to
    ),
    gross_profit_cte as (
      select
        sum(si.quantity * (
          si.mrp - case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
                        then b.purchase_rate / m.units_per_pack
                        else coalesce(b.purchase_rate, 0)
                   end
        )) as gross_profit
      from sales s
      join sale_items si on si.sale_id = s.id
      left join batches b on b.id = si.batch_id
      left join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.bill_date between p_from and p_to and s.deleted_at is null
    ),
    top_meds as (
      select
        m.id as medicine_id, m.name, m.manufacturer,
        sum(si.quantity) as qty_sold,
        count(distinct si.sale_id) as bills,
        sum(si.amount) as revenue
      from sale_items si
      join sales s on s.id = si.sale_id and s.store_id = p_store_id
        and s.bill_date between p_from and p_to and s.deleted_at is null
      left join medicines m on m.id = si.medicine_id
      where si.medicine_id is not null
      group by m.id, m.name, m.manufacturer
      order by revenue desc
      limit 10
    ),
    daily_rows as (
      select
        s.bill_date as day,
        count(*) as bill_count,
        sum(s.total_amount) as gross_sales,
        coalesce((select sum(r.total_amount) from sale_returns r where r.store_id = p_store_id and r.return_date = s.bill_date), 0) as returns_total
      from sales s
      where s.store_id = p_store_id and s.bill_date between p_from and p_to and s.deleted_at is null
      group by s.bill_date
      order by s.bill_date
    ),
    payment_method_agg as (
      select
        coalesce(payment_method, 'other') as method,
        sum(paid_amount) as amount,
        count(*) as cnt
      from sales
      where store_id = p_store_id and bill_date between p_from and p_to and deleted_at is null
      group by payment_method
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'bill_count',      (select bill_count from sales_agg),
    'gross_sales',     (select gross_sales from sales_agg),
    'total_paid',      (select total_paid from sales_agg),
    'total_gst',       (select total_gst from sales_agg),
    'cgst',            (select cgst from sales_agg),
    'sgst',            (select sgst from sales_agg),
    'igst',            (select igst from sales_agg),
    'customer_count',  (select customer_count from sales_agg),
    'credit_extended', (select credit_extended from sales_agg),
    'avg_bill_value',  case when (select bill_count from sales_agg) > 0
                         then round((select gross_sales from sales_agg) / (select bill_count from sales_agg), 2)
                         else 0 end,
    'returns_count',   (select returns_count from returns_agg),
    'returns_total',   (select returns_total from returns_agg),
    'net_sales',       greatest(0, (select gross_sales from sales_agg) - coalesce((select returns_total from returns_agg), 0)),
    'gross_profit',    (select coalesce(gross_profit, 0) from gross_profit_cte),
    'expenses_total',  (select expenses_total from expenses_agg),
    'net_profit',      (select coalesce(gross_profit, 0) from gross_profit_cte) - (select expenses_total from expenses_agg),
    'purchases_count', (select purchases_count from purchases_agg),
    'purchases_total', (select purchases_total from purchases_agg),
    'customer_payments_total', (select customer_payments from payments_agg),
    'top_medicines',   coalesce((select jsonb_agg(jsonb_build_object(
                         'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                         'qty_sold', qty_sold, 'bills', bills, 'revenue', revenue
                       )) from top_meds), '[]'::jsonb),
    'daily_breakdown', coalesce((select jsonb_agg(jsonb_build_object(
                         'day', day::text, 'bill_count', bill_count,
                         'gross_sales', gross_sales, 'returns_total', returns_total,
                         'net_sales', greatest(0, gross_sales - returns_total)
                       )) from daily_rows), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                         'method', method, 'amount', amount, 'cnt', cnt
                       )) from payment_method_agg), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_daily(uuid, date, date) from public;
grant execute on function rpc_report_daily(uuid, date, date) to authenticated;

-- ============================================================================
-- _growth_pct — shared delta-percent helper for GrowthKpi-shaped report
-- fields (Overall Performance, Profit Tracking, Growth Trend).
-- 0-previous edge case: 100% growth if current > 0, else 0 (not infinite).
-- ============================================================================

create or replace function public._growth_pct(p_current numeric, p_previous numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_previous is null or p_previous = 0 then
      case when coalesce(p_current, 0) = 0 then 0 else 100 end
    else round((p_current - p_previous) / abs(p_previous) * 100, 2)
  end;
$$;

revoke all on function public._growth_pct(numeric, numeric) from public;
revoke all on function public._growth_pct(numeric, numeric) from authenticated;

-- ============================================================================
-- _report_perf_kpis — private helper: period-over-period KPI bundle.
-- Not granted to `authenticated` directly; only callable via
-- rpc_report_overall_performance (security definer, owned by the same role).
-- ============================================================================

create or replace function _report_perf_kpis(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  revenue           numeric,
  bills             bigint,
  avg_bill_value    numeric,
  items_sold        bigint,
  active_customers  bigint,
  new_customers     bigint,
  gross_profit      numeric,
  net_profit        numeric,
  gross_margin_pct  numeric,
  net_margin_pct    numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_revenue  numeric := 0;
  v_bills    bigint  := 0;
  v_active   bigint  := 0;
  v_items    bigint  := 0;
  v_new      bigint  := 0;
  v_gp       numeric := 0;
  v_exp      numeric := 0;
begin
  if p_from is null or p_to is null then
    return query select 0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  select count(*), coalesce(sum(s.total_amount), 0), count(distinct s.customer_id)
  into v_bills, v_revenue, v_active
  from sales s
  where s.store_id = p_store_id and s.deleted_at is null and s.bill_date between p_from and p_to;

  select coalesce(sum(si.quantity), 0),
         coalesce(sum(si.quantity * (
           si.mrp - case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
                         then b.purchase_rate / m.units_per_pack
                         else coalesce(b.purchase_rate, 0)
                    end
         )), 0)
  into v_items, v_gp
  from sale_items si
  join sales s on s.id = si.sale_id
  left join batches b on b.id = si.batch_id
  left join medicines m on m.id = si.medicine_id
  where s.store_id = p_store_id and s.deleted_at is null and si.is_misc_item = false
    and s.bill_date between p_from and p_to;

  select count(*) into v_new
  from customers c
  where c.store_id = p_store_id and c.deleted_at is null and c.created_at::date between p_from and p_to;

  select coalesce(sum(e.amount), 0) into v_exp
  from expenses e
  where e.store_id = p_store_id and e.deleted_at is null and e.expense_date between p_from and p_to;

  return query select
    v_revenue,
    v_bills,
    case when v_bills > 0 then round(v_revenue / v_bills, 2) else 0 end,
    v_items,
    v_active,
    v_new,
    v_gp,
    (v_gp - v_exp),
    case when v_revenue > 0 then round(v_gp / v_revenue * 100, 2) else 0 end,
    case when v_revenue > 0 then round((v_gp - v_exp) / v_revenue * 100, 2) else 0 end;
end;
$$;

revoke all on function _report_perf_kpis(uuid, date, date) from public;
revoke all on function _report_perf_kpis(uuid, date, date) from authenticated;

-- ============================================================================
-- rpc_report_overall_performance — period KPIs (current vs previous) +
-- point-in-time inventory health + credit health.
-- ============================================================================

create or replace function rpc_report_overall_performance(
  p_store_id    uuid,
  p_period_type text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today      date := current_date;
  v_cur_from   date;
  v_cur_to     date;
  v_prev_from  date;
  v_prev_to    date;
  v_cur        record;
  v_prev       record;
  v_result     jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  case p_period_type
    when 'today' then
      v_cur_from := v_today; v_cur_to := v_today;
      v_prev_from := v_today - 1; v_prev_to := v_today - 1;
    when 'week' then
      v_cur_from := date_trunc('week', v_today)::date;
      v_cur_to   := v_cur_from + 6;
      v_prev_to  := v_cur_from - 1;
      v_prev_from := v_prev_to - 6;
    when 'quarter' then
      v_cur_from := date_trunc('quarter', v_today)::date;
      v_cur_to   := (date_trunc('quarter', v_today) + interval '3 month' - interval '1 day')::date;
      v_prev_from := (date_trunc('quarter', v_today) - interval '3 month')::date;
      v_prev_to   := v_cur_from - 1;
    when '30d' then
      v_cur_from := v_today - 29;
      v_cur_to   := v_today;
      v_prev_to   := v_cur_from - 1;
      v_prev_from := v_prev_to - 29;
    when 'all' then
      select min(bill_date) into v_cur_from from sales where store_id = p_store_id and deleted_at is null;
      if v_cur_from is null then v_cur_from := v_today; end if;
      v_cur_to := v_today;
      v_prev_from := null; v_prev_to := null;
    else  -- 'month' default
      v_cur_from := date_trunc('month', v_today)::date;
      v_cur_to   := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
      v_prev_from := (date_trunc('month', v_today) - interval '1 month')::date;
      v_prev_to   := v_cur_from - 1;
  end case;

  select * into v_cur  from _report_perf_kpis(p_store_id, v_cur_from, v_cur_to);
  select * into v_prev from _report_perf_kpis(p_store_id, v_prev_from, v_prev_to);

  with
    inv_batches as (
      select b.medicine_id, b.current_quantity, b.purchase_rate, b.expiry_date,
             m.sale_unit_mode, m.units_per_pack, m.min_stock_level
      from batches b
      join medicines m on m.id = b.medicine_id
      where b.store_id = p_store_id and b.deleted_at is null
    ),
    inv_by_medicine as (
      select
        medicine_id,
        sum(current_quantity) as total_qty,
        max(sale_unit_mode) as sale_unit_mode,
        max(units_per_pack) as units_per_pack,
        max(min_stock_level) as min_stock_level
      from inv_batches
      group by medicine_id
    ),
    stock_value_cte as (
      select coalesce(sum(
        case when sale_unit_mode = 'both' and units_per_pack > 1
          then current_quantity::numeric / units_per_pack * purchase_rate
          else current_quantity::numeric * purchase_rate
        end
      ), 0) as stock_value
      from inv_batches
    ),
    low_stock_cte as (
      select count(*) as low_stock_count
      from inv_by_medicine
      where (
        case when sale_unit_mode = 'both' and units_per_pack > 1
          then floor(total_qty::numeric / units_per_pack)
          else total_qty::numeric
        end
      ) < min_stock_level
    ),
    near_expiry_cte as (
      select count(*) as near_expiry_count
      from inv_batches
      where current_quantity > 0
        and expiry_date > v_today and expiry_date <= v_today + 60
    ),
    expired_cte as (
      select count(*) as expired_count
      from inv_batches
      where current_quantity > 0 and expiry_date <= v_today
    ),
    dormant_cte as (
      select count(*) as dormant_count
      from inv_by_medicine im
      where im.total_qty > 0
        and not exists (
          select 1 from sale_items si
          join sales s on s.id = si.sale_id
          where si.medicine_id = im.medicine_id
            and s.store_id = p_store_id
            and s.deleted_at is null
            and s.bill_date > v_today - 90
        )
    ),
    total_skus_cte as (
      select count(*) as total_skus
      from medicines
      where store_id = p_store_id and deleted_at is null
    ),
    credit_cte as (
      select
        coalesce(sum(outstanding_balance), 0) as total_outstanding,
        count(*) filter (where outstanding_balance > 0) as customers_with_balance
      from customers
      where store_id = p_store_id and deleted_at is null
    ),
    aging_cte as (
      select
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 0 and 30), 0) as aging_0_30,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 31 and 60), 0) as aging_31_60,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 61 and 90), 0) as aging_61_90,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date > 90), 0) as aging_90_plus
      from sales
      where store_id = p_store_id and deleted_at is null and payment_status in ('partial','pending','credit')
        and total_amount > paid_amount
    )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'type', p_period_type,
      'current_from', v_cur_from, 'current_to', v_cur_to,
      'previous_from', v_prev_from, 'previous_to', v_prev_to
    ),
    'kpis', jsonb_build_object(
      'revenue',          jsonb_build_object('current', v_cur.revenue, 'previous', v_prev.revenue, 'delta_abs', v_cur.revenue - v_prev.revenue, 'delta_pct', public._growth_pct(v_cur.revenue, v_prev.revenue)),
      'bills',             jsonb_build_object('current', v_cur.bills, 'previous', v_prev.bills, 'delta_abs', v_cur.bills - v_prev.bills, 'delta_pct', public._growth_pct(v_cur.bills, v_prev.bills)),
      'avg_bill_value',    jsonb_build_object('current', v_cur.avg_bill_value, 'previous', v_prev.avg_bill_value, 'delta_abs', v_cur.avg_bill_value - v_prev.avg_bill_value, 'delta_pct', public._growth_pct(v_cur.avg_bill_value, v_prev.avg_bill_value)),
      'items_sold',        jsonb_build_object('current', v_cur.items_sold, 'previous', v_prev.items_sold, 'delta_abs', v_cur.items_sold - v_prev.items_sold, 'delta_pct', public._growth_pct(v_cur.items_sold, v_prev.items_sold)),
      'active_customers',  jsonb_build_object('current', v_cur.active_customers, 'previous', v_prev.active_customers, 'delta_abs', v_cur.active_customers - v_prev.active_customers, 'delta_pct', public._growth_pct(v_cur.active_customers, v_prev.active_customers)),
      'new_customers',     jsonb_build_object('current', v_cur.new_customers, 'previous', v_prev.new_customers, 'delta_abs', v_cur.new_customers - v_prev.new_customers, 'delta_pct', public._growth_pct(v_cur.new_customers, v_prev.new_customers)),
      'gross_profit',      jsonb_build_object('current', v_cur.gross_profit, 'previous', v_prev.gross_profit, 'delta_abs', v_cur.gross_profit - v_prev.gross_profit, 'delta_pct', public._growth_pct(v_cur.gross_profit, v_prev.gross_profit)),
      'net_profit',        jsonb_build_object('current', v_cur.net_profit, 'previous', v_prev.net_profit, 'delta_abs', v_cur.net_profit - v_prev.net_profit, 'delta_pct', public._growth_pct(v_cur.net_profit, v_prev.net_profit)),
      'gross_margin_pct',  jsonb_build_object('current', v_cur.gross_margin_pct, 'previous', v_prev.gross_margin_pct, 'delta_abs', v_cur.gross_margin_pct - v_prev.gross_margin_pct, 'delta_pct', public._growth_pct(v_cur.gross_margin_pct, v_prev.gross_margin_pct)),
      'net_margin_pct',    jsonb_build_object('current', v_cur.net_margin_pct, 'previous', v_prev.net_margin_pct, 'delta_abs', v_cur.net_margin_pct - v_prev.net_margin_pct, 'delta_pct', public._growth_pct(v_cur.net_margin_pct, v_prev.net_margin_pct))
    ),
    'inventory', jsonb_build_object(
      'total_skus',          (select total_skus from total_skus_cte),
      'stock_value',         (select stock_value from stock_value_cte),
      'low_stock_count',     (select low_stock_count from low_stock_cte),
      'near_expiry_count',   (select near_expiry_count from near_expiry_cte),
      'expired_count',       (select expired_count from expired_cte),
      'dormant_skus',        (select dormant_count from dormant_cte)
    ),
    'credit', jsonb_build_object(
      'total_outstanding',      (select total_outstanding from credit_cte),
      'customers_with_balance', (select customers_with_balance from credit_cte),
      'aging_0_30',    (select aging_0_30 from aging_cte),
      'aging_31_60',   (select aging_31_60 from aging_cte),
      'aging_61_90',   (select aging_61_90 from aging_cte),
      'aging_90_plus', (select aging_90_plus from aging_cte)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_overall_performance(uuid, text) from public;
grant execute on function rpc_report_overall_performance(uuid, text) to authenticated;
