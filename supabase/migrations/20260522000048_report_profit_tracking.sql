-- ShelfCure Cloud — Migration 0048
-- §2.11.3 Profit Tracking report + a unit_cost correctness fix found while
-- building it.
--
-- Correctness fix: rpc_report_daily and _report_perf_kpis (migrations 44/47)
-- decided whether to divide purchase_rate by units_per_pack using the
-- medicine's overall `sale_unit_mode = 'both'`. That's wrong for mixed sales:
-- a 'both'-mode medicine can have some bills sold as whole packs
-- (selling_unit='pack') and others as loose units (selling_unit='unit')
-- within the same period. si.mrp (and therefore the unit cost it's compared
-- against) is denominated in whatever unit that specific line was sold in,
-- so the divide must key off the *line's* si.selling_unit, not the
-- medicine's mode. The Profit Tracking spec (WEB_PARITY_PLAN §2.11.3) states
-- the correct per-line formula explicitly — apply it everywhere gross profit
-- is computed, not just here, so all profit-figures stay consistent.

-- ============================================================================
-- Fix: rpc_report_daily — unit_cost keyed off si.selling_unit, not
-- m.sale_unit_mode.
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
          si.mrp - case when si.selling_unit = 'unit' and m.units_per_pack > 1
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
-- Fix: _report_perf_kpis — same unit_cost correction.
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
           si.mrp - case when si.selling_unit = 'unit' and m.units_per_pack > 1
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
-- _report_profit_kpis — private helper: the canonical P&L bundle for one
-- date range. Formula chain per WEB_PARITY_PLAN §2.11.3:
--   1. revenue per line = si.taxable_amount (net of GST + per-line discount)
--   2. unit_cost = selling_unit='unit' AND units_per_pack>1
--                  ? purchase_rate/units_per_pack : purchase_rate
--   3. cogs = Σ si.quantity × unit_cost (misc items excluded)
--   4. line_profit = Σ (si.taxable_amount − si.quantity × unit_cost)
--   5. bill_discounts = Σ (sales.discount_amount + sales.special_discount_amount)
--   6. sale_gross_profit = line_profit − bill_discounts
--   7. returns_profit = Σ sri.quantity × ((si.taxable_amount/si.quantity) − unit_cost)
--   8. gross_profit = max(sale_gross_profit − returns_profit, 0)
--   9. net_sales = max(gross_sales − returns_total, 0); gross_margin_pct = gross_profit/net_sales×100
--  10. net_profit = gross_profit − expenses_total; net_margin_pct = net_profit/net_sales×100
-- ============================================================================

create or replace function _report_profit_kpis(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  gross_sales       numeric,
  returns_total     numeric,
  net_sales         numeric,
  revenue           numeric,
  cogs              numeric,
  bill_discounts    numeric,
  gross_profit      numeric,
  expenses_total    numeric,
  net_profit        numeric,
  gross_margin_pct  numeric,
  net_margin_pct    numeric,
  bills             bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_gross_sales        numeric := 0;
  v_bills               bigint  := 0;
  v_bill_discounts      numeric := 0;
  v_returns_total       numeric := 0;
  v_revenue             numeric := 0;
  v_cogs                numeric := 0;
  v_returns_profit      numeric := 0;
  v_sale_gross_profit   numeric := 0;
  v_gross_profit        numeric := 0;
  v_exp                 numeric := 0;
  v_net_sales           numeric := 0;
  v_net_profit          numeric := 0;
begin
  if p_from is null or p_to is null then
    return query select 0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::bigint;
    return;
  end if;

  select count(*), coalesce(sum(total_amount), 0),
         coalesce(sum(coalesce(discount_amount, 0) + coalesce(special_discount_amount, 0)), 0)
  into v_bills, v_gross_sales, v_bill_discounts
  from sales
  where store_id = p_store_id and deleted_at is null and bill_date between p_from and p_to;

  select coalesce(sum(total_amount), 0) into v_returns_total
  from sale_returns
  where store_id = p_store_id and deleted_at is null and return_date between p_from and p_to;

  select coalesce(sum(si.taxable_amount), 0),
         coalesce(sum(si.quantity * (
           case when si.selling_unit = 'unit' and m.units_per_pack > 1
                then b.purchase_rate / m.units_per_pack
                else coalesce(b.purchase_rate, 0)
           end
         )), 0)
  into v_revenue, v_cogs
  from sale_items si
  join sales s on s.id = si.sale_id
  left join batches b on b.id = si.batch_id
  left join medicines m on m.id = si.medicine_id
  where s.store_id = p_store_id and s.deleted_at is null and si.is_misc_item = false
    and s.bill_date between p_from and p_to;

  v_sale_gross_profit := (v_revenue - v_cogs) - v_bill_discounts;

  select coalesce(sum(sri.quantity * (
           (si.taxable_amount / si.quantity) -
           case when si.selling_unit = 'unit' and m.units_per_pack > 1
                then b.purchase_rate / m.units_per_pack
                else coalesce(b.purchase_rate, 0)
           end
         )), 0)
  into v_returns_profit
  from sale_return_items sri
  join sale_items si on si.id = sri.sale_item_id and si.quantity > 0
  join sale_returns sr on sr.id = sri.sale_return_id
  left join batches b on b.id = si.batch_id
  left join medicines m on m.id = si.medicine_id
  where sr.store_id = p_store_id and sr.deleted_at is null
    and sr.return_date between p_from and p_to;

  v_gross_profit := greatest(v_sale_gross_profit - v_returns_profit, 0);

  select coalesce(sum(amount), 0) into v_exp
  from expenses
  where store_id = p_store_id and deleted_at is null and expense_date between p_from and p_to;

  v_net_sales  := greatest(v_gross_sales - v_returns_total, 0);
  v_net_profit := v_gross_profit - v_exp;

  return query select
    v_gross_sales,
    v_returns_total,
    v_net_sales,
    v_revenue,
    v_cogs,
    v_bill_discounts,
    v_gross_profit,
    v_exp,
    v_net_profit,
    case when v_net_sales > 0 then round(v_gross_profit / v_net_sales * 100, 2) else 0 end,
    case when v_net_sales > 0 then round(v_net_profit / v_net_sales * 100, 2) else 0 end,
    v_bills;
end;
$$;

revoke all on function _report_profit_kpis(uuid, date, date) from public;
revoke all on function _report_profit_kpis(uuid, date, date) from authenticated;

-- ============================================================================
-- rpc_report_profit_tracking — full P&L for [p_from, p_to] vs an equal-length
-- immediately-preceding window, plus a daily trend and manufacturer-level
-- top-earner / loss-maker tables.
-- ============================================================================

create or replace function rpc_report_profit_tracking(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days       int;
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
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_date_range' using errcode = '22007';
  end if;

  v_days      := (p_to - p_from) + 1;
  v_prev_to   := p_from - 1;
  v_prev_from := p_from - v_days;

  select * into v_cur  from _report_profit_kpis(p_store_id, p_from, p_to);
  select * into v_prev from _report_profit_kpis(p_store_id, v_prev_from, v_prev_to);

  with
    daily_cte as (
      select
        s.bill_date as day,
        count(distinct s.id) as bills,
        coalesce(sum(si.taxable_amount), 0) as revenue,
        coalesce(sum(si.quantity * (
          case when si.selling_unit = 'unit' and m.units_per_pack > 1
               then b.purchase_rate / m.units_per_pack
               else coalesce(b.purchase_rate, 0)
          end
        )), 0) as cogs
      from sales s
      join sale_items si on si.sale_id = s.id and si.is_misc_item = false
      left join batches b on b.id = si.batch_id
      left join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.deleted_at is null and s.bill_date between p_from and p_to
      group by s.bill_date
      order by s.bill_date
    ),
    manufacturer_cte as (
      select
        coalesce(nullif(trim(m.manufacturer), ''), 'Unbranded') as manufacturer,
        count(distinct si.medicine_id) as skus,
        coalesce(sum(si.taxable_amount), 0) as revenue,
        coalesce(sum(si.quantity * (
          case when si.selling_unit = 'unit' and m.units_per_pack > 1
               then b.purchase_rate / m.units_per_pack
               else coalesce(b.purchase_rate, 0)
          end
        )), 0) as cogs
      from sale_items si
      join sales s on s.id = si.sale_id
      left join batches b on b.id = si.batch_id
      left join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.deleted_at is null and si.is_misc_item = false
        and s.bill_date between p_from and p_to
      group by coalesce(nullif(trim(m.manufacturer), ''), 'Unbranded')
    ),
    manufacturer_profit as (
      select
        manufacturer, skus, revenue, cogs,
        (revenue - cogs) as profit,
        case when revenue > 0 then round((revenue - cogs) / revenue * 100, 2) else 0 end as margin_pct
      from manufacturer_cte
    )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'from', p_from, 'to', p_to, 'days', v_days,
      'previous_from', v_prev_from, 'previous_to', v_prev_to
    ),
    'kpis', jsonb_build_object(
      'net_sales',        jsonb_build_object('current', v_cur.net_sales, 'previous', v_prev.net_sales, 'delta_abs', v_cur.net_sales - v_prev.net_sales, 'delta_pct', public._growth_pct(v_cur.net_sales, v_prev.net_sales)),
      'bills',             jsonb_build_object('current', v_cur.bills, 'previous', v_prev.bills, 'delta_abs', v_cur.bills - v_prev.bills, 'delta_pct', public._growth_pct(v_cur.bills, v_prev.bills)),
      'gross_profit',      jsonb_build_object('current', v_cur.gross_profit, 'previous', v_prev.gross_profit, 'delta_abs', v_cur.gross_profit - v_prev.gross_profit, 'delta_pct', public._growth_pct(v_cur.gross_profit, v_prev.gross_profit)),
      'net_profit',        jsonb_build_object('current', v_cur.net_profit, 'previous', v_prev.net_profit, 'delta_abs', v_cur.net_profit - v_prev.net_profit, 'delta_pct', public._growth_pct(v_cur.net_profit, v_prev.net_profit)),
      'gross_margin_pct',  jsonb_build_object('current', v_cur.gross_margin_pct, 'previous', v_prev.gross_margin_pct, 'delta_abs', v_cur.gross_margin_pct - v_prev.gross_margin_pct, 'delta_pct', public._growth_pct(v_cur.gross_margin_pct, v_prev.gross_margin_pct)),
      'net_margin_pct',    jsonb_build_object('current', v_cur.net_margin_pct, 'previous', v_prev.net_margin_pct, 'delta_abs', v_cur.net_margin_pct - v_prev.net_margin_pct, 'delta_pct', public._growth_pct(v_cur.net_margin_pct, v_prev.net_margin_pct))
    ),
    'gross_sales',        v_cur.gross_sales,
    'returns_total',      v_cur.returns_total,
    'revenue',             v_cur.revenue,
    'cogs',                v_cur.cogs,
    'bill_discounts',      v_cur.bill_discounts,
    'expenses_total',      v_cur.expenses_total,
    'avg_profit_per_day',  case when v_days > 0 then round(v_cur.gross_profit / v_days, 2) else 0 end,
    'daily',  coalesce((select jsonb_agg(jsonb_build_object(
                'day', day::text, 'bills', bills, 'revenue', revenue, 'cogs', cogs,
                'gross_profit', revenue - cogs
              )) from daily_cte), '[]'::jsonb),
    'top_earners', coalesce((select jsonb_agg(jsonb_build_object(
                'manufacturer', manufacturer, 'skus', skus, 'revenue', revenue,
                'cogs', cogs, 'profit', profit, 'margin_pct', margin_pct
              ) order by profit desc)
              from (select * from manufacturer_profit order by profit desc limit 10) t), '[]'::jsonb),
    'loss_makers', coalesce((select jsonb_agg(jsonb_build_object(
                'manufacturer', manufacturer, 'skus', skus, 'revenue', revenue,
                'cogs', cogs, 'profit', profit, 'margin_pct', margin_pct
              ) order by profit asc)
              from (select * from manufacturer_profit where profit < 0 order by profit asc limit 10) t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_profit_tracking(uuid, date, date) from public;
grant execute on function rpc_report_profit_tracking(uuid, date, date) to authenticated;
